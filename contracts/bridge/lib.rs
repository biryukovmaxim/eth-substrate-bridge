#![cfg_attr(not(feature = "std"), no_std)]

use ink_lang as ink;

#[ink::contract]
mod bridge {
    use erc20::Erc20Ref;

    use ink_env::call::FromAccountId;
    use ink_storage::traits::{PackedLayout, SpreadAllocate, SpreadLayout};

    use thiserror_no_std::Error;

    #[derive(Error, Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        #[error("You need to transfer at least some tokens")]
        ZeroAmount,
        #[error("Not enough allowance for transfer, allowance: {allowance:?}, amount: {amount:?}")]
        Allowance { allowance: u128, amount: u128 },
        #[error("Erc20 error")]
        Erc20(#[from] erc20::erc20::Error),
        #[error("Transfer '{0}' not found")]
        NotFound(u128),
        #[error("It's not acceptable to refund successful transfer")]
        RefundSuccessfulTransfer,
        #[error("It's not acceptable to try_again successful transfer")]
        TryAgainSuccessfulTransfer,
        #[error("It's not acceptable to process unsuccessful transfer")]
        ProcessUnsuccessfulTransfer,
        #[error("Bridge doesn't have enough amount, balance: {balance:?}, amount: {amount:?}")]
        InsufficientBridgeBalance { balance: Balance, amount: Balance },
        #[error("Unexpected error")]
        Unexpected,
        #[error("Only executor is able to process queued transfers")]
        ExecutorPermissionDenied,
        #[error("Only sender is able to refund unsuccessful transfer")]
        RefundPermissionDenied,
    }

    /// The ERC-20 result type.
    pub type Result<T> = core::result::Result<T, Error>;

    #[derive(
        Debug, PartialEq, Eq, scale::Encode, scale::Decode, Clone, Copy, SpreadLayout, PackedLayout,
    )]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct Transfer {
        id: u128,
        from: AccountId,
        to: [u8; 20],
        amount: Balance,
    }

    #[ink(storage)]
    #[derive(SpreadAllocate)]
    pub struct Bridge {
        queue: ink_storage::Mapping<u128, Transfer>,
        failed_transfers: ink_storage::Mapping<u128, Transfer>,
        token_address: AccountId,
        executor: AccountId,
        counter: u128,
    }

    #[ink(event)]
    pub struct Queued {
        #[ink(topic)]
        id: u128,
        #[ink(topic)]
        from: AccountId,
        to: [u8; 20],
        amount: Balance,
        #[ink(topic)]
        timestamp: Timestamp,
    }

    #[ink(event)]
    pub struct SuccessfulTransfer {
        #[ink(topic)]
        id: u128,
        #[ink(topic)]
        from: AccountId,
        to: [u8; 20],
        amount: Balance,
        #[ink(topic)]
        timestamp: Timestamp,
    }

    #[ink(event)]
    pub struct FailedTransfer {
        #[ink(topic)]
        id: u128,
        #[ink(topic)]
        from: AccountId,
        to: [u8; 20],
        amount: Balance,
        #[ink(topic)]
        timestamp: Timestamp,
    }

    #[ink(event)]
    pub struct Refund {
        #[ink(topic)]
        id: u128,
        #[ink(topic)]
        to: AccountId,
        amount: Balance,
        #[ink(topic)]
        timestamp: Timestamp,
    }

    impl Bridge {
        fn get_erc20_ref(&self) -> Erc20Ref {
            FromAccountId::from_account_id(self.token_address)
        }

        #[ink(constructor)]
        pub fn new(token: AccountId) -> Self {
            ink_lang::utils::initialize_contract(|contract: &mut Self| {
                contract.token_address = token;
                contract.executor = Self::env().caller();
                contract.counter = 0;
            })
        }

        #[ink(message)]
        pub fn get_transfer(&self, transfer_id: u128) -> Result<Option<(Transfer, bool)>> {
            Ok(self
                .queue
                .get(transfer_id)
                .map(|t| (t, true))
                .or_else(|| self.failed_transfers.get(transfer_id).map(|t| (t, false))))
        }

        #[ink(message)]
        pub fn transfer(
            &mut self,
            amount: Balance,
            external_destination_address: [u8; 20],
        ) -> Result<u128> {
            let caller = self.env().caller();
            let contract = self.env().account_id();
            (amount > 0).then(|| {}).ok_or(Error::ZeroAmount)?;
            let mut token = Self::get_erc20_ref(self);
            let allowance = token.allowance(caller, contract);
            (allowance >= amount)
                .then(|| {})
                .ok_or(Error::Allowance { allowance, amount })?;
            token.transfer_from(caller, contract, amount)?;
            self.counter += 1;
            self.queue.insert(
                self.counter,
                &Transfer {
                    id: self.counter,
                    from: caller,
                    to: external_destination_address,
                    amount,
                },
            );
            ink_lang::codegen::EmitEvent::<Bridge>::emit_event(
                self.env(),
                Queued {
                    id: self.counter,
                    from: caller,
                    to: external_destination_address,
                    amount,
                    timestamp: self.env().block_timestamp(),
                },
            );
            Ok(self.counter)
        }

        #[ink(message)]
        pub fn refund(&mut self, transfer_id: u128) -> Result<()> {
            let (transfer, successful): (Transfer, bool) = self
                .get_transfer(transfer_id)?
                .ok_or(Error::NotFound(transfer_id))?;
            if successful {
                Err(Error::RefundSuccessfulTransfer)
            } else {
                let caller = self.env().caller();
                if transfer.from != self.env().caller() {
                    return Err(Error::RefundPermissionDenied);
                }
                let mut erc20_contract = self.get_erc20_ref();
                let balance = erc20_contract.balance_of(self.env().account_id());
                (balance >= transfer.amount)
                    .then(|| {
                        erc20_contract
                            .transfer(transfer.from, transfer.amount)
                            .map_err(Into::into)
                            .and_then(|_| {
                                self.failed_transfers.remove(transfer_id);
                                ink_lang::codegen::EmitEvent::<Bridge>::emit_event(
                                    self.env(),
                                    Refund {
                                        id: transfer.id,
                                        to: caller,
                                        amount: transfer.amount,
                                        timestamp: self.env().block_timestamp(),
                                    },
                                );
                                Ok(())
                            })
                    })
                    .ok_or(Error::InsufficientBridgeBalance {
                        balance,
                        amount: (transfer.amount),
                    })?
            }
        }

        #[ink(message)]
        pub fn try_again(&mut self, transfer_id: u128) -> Result<()> {
            let (transfer, successful): (Transfer, bool) = self
                .get_transfer(transfer_id)?
                .ok_or(Error::NotFound(transfer_id))?;
            if successful {
                Err(Error::TryAgainSuccessfulTransfer)
            } else {
                self.queue.insert(transfer_id, &transfer);
                self.failed_transfers.remove(transfer_id);
                ink_lang::codegen::EmitEvent::<Bridge>::emit_event(
                    self.env(),
                    Queued {
                        id: transfer.id,
                        from: transfer.from,
                        to: transfer.to,
                        amount: transfer.amount,
                        timestamp: self.env().block_timestamp(),
                    },
                );
                Ok(())
            }
        }

        #[ink(message)]
        pub fn process_transfer(
            &mut self,
            transfer_id: u128,
            mark_as_successful: bool,
        ) -> Result<()> {
            (self.executor == self.env().caller())
                .then(|| {})
                .ok_or(Error::ExecutorPermissionDenied)?;
            let (transfer, successful): (Transfer, bool) = self
                .get_transfer(transfer_id)?
                .ok_or(Error::NotFound(transfer_id))?;
            if !successful {
                Err(Error::ProcessUnsuccessfulTransfer)
            } else {
                self.queue.remove(transfer_id);
                if mark_as_successful {
                    ink_lang::codegen::EmitEvent::<Bridge>::emit_event(
                        self.env(),
                        SuccessfulTransfer {
                            id: transfer.id,
                            from: transfer.from,
                            to: transfer.to,
                            amount: transfer.amount,
                            timestamp: self.env().block_timestamp(),
                        },
                    );
                } else {
                    self.failed_transfers.insert(transfer_id, &transfer);
                    ink_lang::codegen::EmitEvent::<Bridge>::emit_event(
                        self.env(),
                        FailedTransfer {
                            id: transfer.id,
                            from: transfer.from,
                            to: transfer.to,
                            amount: transfer.amount,
                            timestamp: self.env().block_timestamp(),
                        },
                    );
                }

                Ok(())
            }
        }
    }
}
