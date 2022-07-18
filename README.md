# ETH-SUBSTRATE Bridge Project

This project is MVP Bridge between substrate compatible node and ethereum node:
# Implemented Functional:
Transfer MyToken(ERC-20 token) between chains, refund failed transfers, rerun failed transfers

### Compile substrate contract(from contract directory):
```shell
cargo contract build --release
```
### Compile solidity contract:
```shell
npx hardhat compile
```

## Run local tests :
### Run local substrate node
```shell
substrate-contracts-node --dev --tmp
```
### then
```shell
npx hardhat test
```

## Run Bridge application
```shell
ts-node cmd/bridge.ts
```