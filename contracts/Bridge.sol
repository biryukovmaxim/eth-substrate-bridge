// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Bridge {
    event Queued(
        uint256 indexed id,
        address indexed from,
        uint8[32] to,
        uint256 amount,
        uint256 indexed timestamp
    );
    event InsufficientBridgeBalance(uint256 balance, uint256 indexed timestamp);
    event Refund(address indexed to, uint256 amount, uint256 indexed timestamp);
    event SuccessfulTransfer(
        uint256 indexed id,
        address indexed from,
        uint8[32] to,
        uint256 amount,
        uint256 indexed timestamp
    );
    event FailedTransfer(
        uint256 indexed id,
        address indexed from,
        uint8[32] to,
        uint256 amount,
        uint256 indexed timestamp
    );

    struct Transfer {
        uint256 id;
        address from;
        uint8[32] to;
        uint256 amount;
    }
    mapping(uint256 => Transfer) queue;
    mapping(uint256 => Transfer) failed_transfers;

    uint8[32] public substrateBridgeAddress;
    IERC20 _token;
    address public executor;
    uint64 counter = 0;

    // token = MyToken's contract address
    constructor(address token, uint8[32] memory bridgeAddress) {
        _token = IERC20(token);
        executor = msg.sender;
        substrateBridgeAddress = bridgeAddress;
    }

    modifier onlyExecutor() {
        require(msg.sender == executor, "you are not executor");
        _;
    }

    function transfer(uint256 amount, uint8[32] calldata destination)
        external
        payable
    {
        require(amount > 0, "You need to transfer at least some tokens");
        uint256 allowance = _token.allowance(msg.sender, address(this));
        require(allowance >= amount, "Check the token allowance");

        bool ok = _token.transferFrom(msg.sender, address(this), amount);
        if (!ok) {
            return;
        }
        counter++;
        queue[counter] = Transfer(counter, msg.sender, destination, amount);
        emit Queued(counter, msg.sender, destination, amount, block.timestamp);
    }

    function refund(uint256 transferID) external returns (bool) {
        (Transfer memory trans, bool exists, bool successful) = getTransfer(
            transferID
        );
        require(trans.from == msg.sender, "you are not transfer initiator");
        require(
            exists && !successful,
            "refund is not acceptable, transfer is not exists or successful"
        );

        uint256 balance = _token.balanceOf(address(this));
        if (balance < trans.amount) {
            emit InsufficientBridgeBalance(balance, block.timestamp);
            revert("bridge does not have enough amount to transfer");
        }
        bool refunded = _token.transfer(trans.from, trans.amount);
        if (!refunded) {
            return false;
        }
        delete failed_transfers[transferID];
        emit Refund(trans.from, trans.amount, block.timestamp);
        return true;
    }

    function try_again(uint256 transferID) external returns (bool queued) {
        (Transfer memory order, bool exists, bool successful) = getTransfer(
            transferID
        );
        if (!exists || successful) {
            return false;
        }
        queue[transferID] = failed_transfers[transferID];
        delete failed_transfers[transferID];

        emit Queued(
            transferID,
            order.from,
            order.to,
            order.amount,
            block.timestamp
        );
        return true;
    }

    function getTransfer(uint256 transferID)
        public
        view
        returns (
            Transfer memory order,
            bool exists,
            bool successful
        )
    {
        order = queue[transferID];
        if (order.id > 0) {
            return (order, true, true);
        }
        order = failed_transfers[transferID];
        if (order.id > 0) {
            return (order, true, false);
        }
        return (order, false, false);
    }

    function processTransfer(uint256 transferID, bool isSuccessful)
        public
        onlyExecutor
        returns (bool isSet)
    {
        (Transfer memory order, bool exists, ) = getTransfer(transferID);
        require(exists, "transferID is not exist");

        if (!isSuccessful) {
            failed_transfers[transferID] = queue[transferID];
            delete queue[transferID];
            emit FailedTransfer(
                transferID,
                order.from,
                order.to,
                order.amount,
                block.timestamp
            );
            return true;
        }
        delete queue[transferID];

        emit SuccessfulTransfer(
            transferID,
            order.from,
            order.to,
            order.amount,
            block.timestamp
        );
        return true;
    }
}
