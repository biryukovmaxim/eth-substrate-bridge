#![cfg_attr(not(feature = "std"), no_std)]

use ink_lang as ink;

#[ink::contract]
mod bridge {
    use erc20::Erc20Ref;
    // use ink_env::AccountId;

    use ink_env::call::FromAccountId;
    use ink_storage::traits::{PackedLayout, SpreadAllocate, SpreadLayout};
    use scale_info::{Type, TypeInfo};

    use thiserror_no_std::Error;

    #[derive(Error, Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    pub enum Error {
        #[error("You need to transfer at least some tokens")]
        ZeroAmount,
        #[error("Not enough allowance for transfer, allowance: {allowance:?}, amount: {amount:?}")]
        Allowance { allowance: u128, amount: u128 },
        #[error("Erc20 error")]
        Erc20(#[from] erc20::erc20::Error),
    }

    impl TypeInfo for Error {
        type Identity = ();

        fn type_info() -> Type {
            todo!()
        }
    }

    /// The ERC-20 result type.
    pub type Result<T> = core::result::Result<T, Error>;

    #[derive(
        Debug,
        PartialEq,
        Eq,
        scale::Encode,
        scale::Decode,
        Clone,
        Copy,
        SpreadLayout,
        PackedLayout,
        scale_info::TypeInfo,
    )]
    pub struct Transfer {
        id: u128,
        from: [u8; 32],
        to: [u8; 20],
        amount: Balance,
    }

    #[ink(storage)]
    #[derive(SpreadAllocate)]
    pub struct Bridge {
        // mapping(uint256 => Transfer) queue;
        // mapping(uint256 => Transfer) failed_transfers;
        //
        queue: ink_storage::Mapping<u128, Transfer>,
        failed_transfers: ink_storage::Mapping<u128, Transfer>,

        ether_bridge_address: [u8; 20],
        token_address: AccountId,
        executor: AccountId,
        counter: u128,
    }

    impl Bridge {
        fn get_erc20_ref(&self) -> Erc20Ref {
            FromAccountId::from_account_id(self.token_address)
        }

        #[ink(constructor)]
        pub fn new(token: AccountId, bridge_address: [u8; 20]) -> Self {
            ink_lang::utils::initialize_contract(|contract: &mut Self| {
                contract.token_address = token;
                contract.ether_bridge_address = bridge_address;
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
                    from: *caller.as_ref(),
                    to: external_destination_address,
                    amount,
                },
            );
            //  todo emit Queued(counter, msg.sender, destination, amount, block.timestamp);
            Ok(self.counter)
        }

        fn refund(&self, transfer_id: u128) {}

        // function refund(uint256 transferID) external returns (bool) {
        // (Transfer memory trans, bool exists, bool successful) = getTransfer(
        // transferID
        // );
        // require(trans.from == msg.sender, "you are not transfer initiator");
        // require(
        // exists && !successful,
        // "refund is not acceptable, transfer is not exists or successful"
        // );
        //
        // uint256 balance = _token.balanceOf(address(this));
        // if (balance < trans.amount) {
        // emit InsufficientBridgeBalance(balance, block.timestamp);
        // revert("bridge does not have enough amount to transfer");
        // }
        // bool refunded = _token.transfer(trans.from, trans.amount);
        // if (!refunded) {
        // return false;
        // }
        // delete failed_transfers[transferID];
        // emit Refund(trans.from, trans.amount, block.timestamp);
        // return true;
        // }
    }
}
