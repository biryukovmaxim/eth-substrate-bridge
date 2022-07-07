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
    struct Transfer {
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
    }
}
