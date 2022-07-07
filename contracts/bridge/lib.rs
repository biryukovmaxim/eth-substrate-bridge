#![cfg_attr(not(feature = "std"), no_std)]

use ink_lang as ink;

#[ink::contract]
mod bridge {
    // use ink_env::AccountId;
    use crate::erc20;
    use thiserror::Error;
    use scale_info::TypeInfo;
    use ink_storage::traits::SpreadAllocate;
    use scale::{Encode, Decode};
    // use parity_scale_codec_derive::{Encode};

    #[derive(Error, Debug, PartialEq,TypeInfo,Encode)]
    pub enum Error {
        #[error("You need to transfer at least some tokens")]
        ZeroAmount,
        #[error("Not enough allowance for transfer, allowance: {allowance:?}, amount: {amount:?}")]
        Allowance { allowance: u128, amount: u128 },
    }

    #[ink(storage)]
    #[derive(SpreadAllocate)]
    pub struct Bridge {
        // mapping(uint256 => Transfer) queue;
        // mapping(uint256 => Transfer) failed_transfers;
        //
        ether_bridge_address: [u8; 20],
        token: erc20::Erc20,
        executor: AccountId,
        counter: u128,
    }

    impl Bridge {
        #[ink(constructor)]
        pub fn new(token: AccountId, bridge_address: [u8; 20]) -> Self {
            ink_lang::utils::initialize_contract(|contract: &mut Self| {
                contract.token = ink_env::call::FromAccountId::from_account_id(token);
                contract.ether_bridge_address = bridge_address;
                contract.executor = Self::env().caller();
                contract.counter = 0;
            })
        }

        #[ink(message)]
        pub fn transfer(&mut self, amount: u128, external_destination_address: [u8; 20]) -> Result<u128, Error> {
            let caller = self.env().caller();
            let contract = self.env().account_id();
            (amount > 0).then(()).ok_or(Error::ZeroAmount)?;
            let allowance = self.token.allowance(caller, contract);
            (allowance >= amount).then(()).ok_or(Error::Allowance { allowance, amount })?;

            self.token.transfer_from(caller, contract, amount);
            Ok(1)
        }
    }
