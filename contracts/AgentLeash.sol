// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Namespaces the Revoked error because Solidity cannot declare an error and
/// event with the same name in the same scope. Its selector remains Revoked().
library AgentLeashErrors {
    error Revoked();
}

/**
 * @title AgentLeash
 * @notice Independent, owner-funded USDC budgets for AI agents, with immutable
 * per-leash balance caps, optional payee limits, pausing and recurring payments.
 * There is no global administrator, fee, ownership transfer, upgrade mechanism or proxy.
 * @dev All amounts use USDC's 6-decimal base units. A leash's balance cap is chosen
 * at creation, cannot change, and may not exceed 1_000_000_000_000 (1,000,000 USDC).
 * This limits its current balance, not lifetime funding. On Arc the intended token
 * is 0x3600000000000000000000000000000000000000. The constructor selects the token;
 * it must be standard, non-rebasing, non-fee-on-transfer USDC. Direct token donations
 * are not credited to any leash and cannot be swept.
 * Allowlisted payees and qualifying auto-approved new payees are paid immediately;
 * other agent payments queue without reserving funds. Every immediate payment
 * satisfies the exact leash-wide rolling cap, cooldown and balance checks.
 * Allowlisted payees may override the default per-payment limit and have an
 * additional fixed 24-hour cap starting at their first payment, not a rolling cap.
 * This payee cap is a sub-limit under the exact leash-wide rolling cap.
 * Owner approvals and schedules bypass agent spending rules and do not affect
 * rolling spend, lastPaymentAt or payee.spent. Only immediate agent payments count.
 * Pausing blocks agent payments and schedule execution, not owner management.
 * Spend uses an exact rolling 24-hour window with capacity for 32 immediate payments
 * per leash; each expires individually after 24 hours. An immediate payment reverts
 * WindowFull() if all 32 entries are still within the window. Schedules are bounded
 * to twenty active entries per leash and skip missed periods without catch-up.
 */
contract AgentLeash is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_BALANCE_CEILING = 1_000_000_000_000;
    uint256 public constant MAX_INITIAL_PAYEES = 10;
    uint256 public constant MAX_PENDING = 20;
    uint256 public constant WINDOW_SLOTS = 32;
    uint256 public constant MAX_REASON_LENGTH = 280;
    uint256 public constant MIN_INTERVAL = 1 hours;
    uint256 public constant MAX_INTERVAL = 366 days;
    uint256 public constant MAX_SCHEDULES = 20;
    uint256 private constant REFUND_GAS_LIMIT = 100_000;

    IERC20 public immutable usdc;
    uint256 public nextLeashId = 1;

    enum Status {
        None,
        Pending,
        Approved,
        Rejected
    }

    /// @dev Original fields retain their order; new fields are appended.
    /// Owner, agent, expiry and balanceCap never change after creation.
    /// autoApproveLimit == 0 disables automatic immediate payments to new payees.
    struct Leash {
        address owner;
        uint64 expiresAt;
        bool revoked;
        address agent;
        uint64 createdAt;
        uint128 dailyCap;
        uint128 perPaymentLimit;
        uint128 balance;
        uint64 createdAtBlock;
        uint64 lastPaymentAt;
        uint32 cooldown;
        uint32 nextRequestId;
        uint32 pendingCount;
        uint128 balanceCap;
        uint128 autoApproveLimit;
        bool paused;
        uint32 nextScheduleId;
        uint32 activeSchedules;
    }

    /// @dev Zero limits mean no override. spent tracks immediate payments while a
    /// payee daily cap is enabled. Its fixed 24-hour period starts on first payment;
    /// it is not rolling and remains subordinate to the leash-wide rolling cap.
    /// Limit changes and removal reset the counter; approvals and schedules ignore it.
    struct PayeeConfig {
        bool allowed;
        uint128 perPaymentLimit;
        uint128 dailyCap;
        uint128 spent;
        uint64 periodStart;
    }

    /// @dev An owner-authorized recurring payment; maxRuns == 0 means unlimited.
    /// Only one payment occurs per execution, with nextDue advanced beyond now.
    struct Schedule {
        address payee;
        uint128 amount;
        uint64 interval;
        uint64 nextDue;
        uint32 maxRuns;
        uint32 runs;
        bool active;
    }

    /// @dev An unreserved owner-consent request; None denotes an unused ID.
    struct Request {
        address payee;
        uint128 amount;
        uint64 createdAt;
        Status status;
        string reason;
    }

    /// @dev One storage slot per payment in the exact rolling 24-hour window.
    struct Entry {
        uint64 ts;
        uint192 amount;
    }

    mapping(uint256 => Leash) private _leashes;
    mapping(uint256 => mapping(address => PayeeConfig)) private _payees;
    mapping(uint256 => mapping(uint32 => Request)) private _requests;
    mapping(uint256 => Entry[32]) private _window;
    mapping(uint256 => mapping(uint32 => Schedule)) private _schedules;

    error NotOwner();
    error NotAgent();
    error LeashNotFound();
    error ZeroAddress();
    error ZeroAmount();
    error ZeroReason();
    error ReasonTooLong(uint256 length, uint256 maximum);
    error ExpiryInPast();
    error InvalidLimits();
    error BalanceCapExceeded(uint256 requestedBalance, uint256 maximum);
    error TooManyPayees();
    error TooManyPending();
    error Expired();
    error OverPerPaymentLimit(uint256 amount, uint256 limit);
    error OverDailyCap(uint256 requested, uint256 remaining);
    error WindowFull();
    error CooldownActive(uint256 availableAt);
    error InsufficientBalance(uint256 requested, uint256 available);
    error RequestNotPending();
    error Paused();
    error InvalidCap();
    error PayeeNotAllowed();
    error OverPayeeDailyCap(uint256 requested, uint256 remaining);
    error TooManySchedules();
    error ScheduleNotActive();
    error ScheduleNotDue(uint256 nextDue);
    error InvalidSchedule();

    event LeashCreated(
        uint256 indexed leashId,
        address indexed owner,
        address indexed agent,
        uint128 dailyCap,
        uint128 perPaymentLimit,
        uint32 cooldown,
        uint64 expiresAt,
        uint128 balanceCap
    );
    event Funded(uint256 indexed leashId, address indexed funder, uint256 amount, uint256 newBalance);
    event PayeeAdded(uint256 indexed leashId, address indexed payee);
    event PayeeRemoved(uint256 indexed leashId, address indexed payee);
    event PayeeLimitsSet(uint256 indexed leashId, address indexed payee, uint128 perPaymentLimit, uint128 dailyCap);
    event AutoApproveLimitSet(uint256 indexed leashId, uint128 amount);
    event PausedSet(uint256 indexed leashId, bool paused);
    event ScheduleCreated(
        uint256 indexed leashId,
        uint32 indexed scheduleId,
        address indexed payee,
        uint128 amount,
        uint64 interval,
        uint64 nextDue,
        uint32 maxRuns
    );
    event ScheduleCancelled(uint256 indexed leashId, uint32 indexed scheduleId);
    event ScheduleExecuted(
        uint256 indexed leashId,
        uint32 indexed scheduleId,
        address indexed payee,
        uint128 amount,
        uint32 runs,
        uint64 nextDue
    );
    event LimitsUpdated(uint256 indexed leashId, uint128 dailyCap, uint128 perPaymentLimit, uint32 cooldown);
    event Paid(uint256 indexed leashId, address indexed payee, uint128 amount, string reason, uint32 requestId);
    event Queued(
        uint256 indexed leashId,
        uint32 indexed requestId,
        address indexed payee,
        uint128 amount,
        string reason
    );
    event Approved(uint256 indexed leashId, uint32 indexed requestId, address indexed payee, uint128 amount);
    event Rejected(uint256 indexed leashId, uint32 indexed requestId);
    event Revoked(uint256 indexed leashId, uint256 refunded);
    event Withdrawn(uint256 indexed leashId, uint256 amount);

    /// @notice Select the 6-decimal USDC token permanently; zero is forbidden.
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    /**
     * @notice Create an independently owned leash with an immutable balance cap.
     * @dev Agent must be nonzero, expiry strictly future, and limits positive with
     * perPaymentLimit <= dailyCap. balanceCap must be positive and no greater than
     * MAX_BALANCE_CEILING; initial funding may not exceed it. At most ten initial
     * nonzero payees are allowed; duplicates are harmless and each emits PayeeAdded.
     * Zero funding is OK. All state writes precede the optional token pull. Leash,
     * request and schedule IDs start at one; auto-approval and pausing start off.
     */
    function createLeash(
        address agent,
        uint128 dailyCap,
        uint128 perPaymentLimit,
        uint32 cooldownSeconds,
        uint64 expiresAt,
        uint128 balanceCap,
        uint256 fundAmount,
        address[] calldata payees
    ) external nonReentrant returns (uint256 leashId) {
        if (agent == address(0)) revert ZeroAddress();
        if (expiresAt <= block.timestamp) revert ExpiryInPast();
        _validateLimits(dailyCap, perPaymentLimit);
        if (balanceCap == 0 || balanceCap > MAX_BALANCE_CEILING) revert InvalidCap();
        if (fundAmount > balanceCap) revert BalanceCapExceeded(fundAmount, balanceCap);
        if (payees.length > MAX_INITIAL_PAYEES) revert TooManyPayees();

        leashId = nextLeashId++;
        Leash storage leash = _leashes[leashId];
        leash.owner = msg.sender;
        leash.agent = agent;
        leash.dailyCap = dailyCap;
        leash.perPaymentLimit = perPaymentLimit;
        leash.balance = uint128(fundAmount);
        leash.expiresAt = expiresAt;
        leash.createdAt = uint64(block.timestamp);
        leash.createdAtBlock = uint64(block.number);
        leash.cooldown = cooldownSeconds;
        leash.nextRequestId = 1;
        leash.balanceCap = balanceCap;
        leash.nextScheduleId = 1;
        _addInitialPayees(leashId, payees);

        if (fundAmount != 0) usdc.safeTransferFrom(msg.sender, address(this), fundAmount);
        _emitLeashCreated(leashId, leash);
        if (fundAmount != 0) emit Funded(leashId, msg.sender, fundAmount, fundAmount);
    }

    /// @notice Owner-only positive top-up of an active leash, including while paused.
    /// @dev Balance may not exceed the leash's immutable balanceCap.
    function fund(uint256 leashId, uint256 amount) external nonReentrant {
        Leash storage leash = _ownedLeash(leashId);
        _requireActive(leash);
        if (amount == 0) revert ZeroAmount();
        // Compare before adding so even an enormous amount yields the cap error.
        if (amount > leash.balanceCap - leash.balance) {
            uint256 requestedBalance = amount > type(uint256).max - leash.balance
                ? type(uint256).max
                : uint256(leash.balance) + amount;
            revert BalanceCapExceeded(requestedBalance, leash.balanceCap);
        }
        leash.balance += uint128(amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(leashId, msg.sender, amount, leash.balance);
    }

    /// @notice Owner-only allowlisting of a nonzero payee; allowed after expiry and while paused.
    /// @dev Revocation forbids changes. Existing allowed configs are preserved;
    /// newly allowed payees start without overrides or recorded payee spend.
    function addPayee(uint256 leashId, address payee) external nonReentrant {
        Leash storage leash = _ownedLeash(leashId);
        if (leash.revoked) revert AgentLeashErrors.Revoked();
        if (payee == address(0)) revert ZeroAddress();
        if (!_payees[leashId][payee].allowed) {
            delete _payees[leashId][payee];
            _payees[leashId][payee].allowed = true;
        }
        emit PayeeAdded(leashId, payee);
    }

    /// @notice Owner removes a nonzero payee and clears its limits and spend.
    /// @dev Allowed after expiry and while paused, but not after revocation.
    function removePayee(uint256 leashId, address payee) external nonReentrant {
        Leash storage leash = _ownedLeash(leashId);
        if (leash.revoked) revert AgentLeashErrors.Revoked();
        if (payee == address(0)) revert ZeroAddress();
        delete _payees[leashId][payee];
        emit PayeeRemoved(leashId, payee);
    }

    /**
     * @notice Owner sets overrides for a currently allowlisted payee and resets its period.
     * @dev Allowed after expiry and while paused, but not after revocation. Zero
     * perPaymentLimit uses the leash default; zero dailyCap disables the payee cap.
     * When both overrides are nonzero, perPaymentLimit must not exceed dailyCap.
     * A payee override may exceed the leash default, but never bypasses its exact
     * rolling daily cap. The fixed payee period starts with the next immediate payment.
     */
    function setPayeeLimits(
        uint256 leashId,
        address payee,
        uint128 perPaymentLimit,
        uint128 dailyCap
    ) external nonReentrant {
        Leash storage leash = _ownedLeash(leashId);
        if (leash.revoked) revert AgentLeashErrors.Revoked();
        PayeeConfig storage config = _payees[leashId][payee];
        if (!config.allowed) revert PayeeNotAllowed();
        if (perPaymentLimit != 0 && dailyCap != 0 && perPaymentLimit > dailyCap) revert InvalidLimits();
        config.perPaymentLimit = perPaymentLimit;
        config.dailyCap = dailyCap;
        config.spent = 0;
        config.periodStart = 0;
        emit PayeeLimitsSet(leashId, payee, perPaymentLimit, dailyCap);
    }

    /// @notice Owner sets the maximum immediate payment to a non-allowlisted payee; zero disables it.
    /// @dev Must not exceed the leash default per-payment limit. Allowed after expiry
    /// and while paused, but not after revocation. Does not add payees to the allowlist.
    function setAutoApproveLimit(uint256 leashId, uint128 amount) external nonReentrant {
        Leash storage leash = _ownedLeash(leashId);
        if (leash.revoked) revert AgentLeashErrors.Revoked();
        if (amount > leash.perPaymentLimit) revert InvalidLimits();
        leash.autoApproveLimit = amount;
        emit AutoApproveLimitSet(leashId, amount);
    }

    /// @notice Owner pauses or resumes agent payments and schedule execution.
    /// @dev Allowed after expiry but not revocation. Owner management, approvals,
    /// funding and withdrawals remain available subject to their usual checks.
    function setPaused(uint256 leashId, bool paused_) external nonReentrant {
        Leash storage leash = _ownedLeash(leashId);
        if (leash.revoked) revert AgentLeashErrors.Revoked();
        leash.paused = paused_;
        emit PausedSet(leashId, paused_);
    }

    /**
     * @notice Owner updates positive limits (per-payment <= daily) and cooldown.
     * @dev Allowed after expiry and while paused but not revocation. Existing spend
     * and last payment are retained, so lowering caps or increasing cooldown takes
     * effect immediately. Auto-approval is clamped to the new per-payment limit;
     * payee overrides are retained. Expiry, owner, agent and balanceCap cannot change.
     */
    function updateLimits(
        uint256 leashId,
        uint128 dailyCap,
        uint128 perPaymentLimit,
        uint32 cooldownSeconds
    ) external nonReentrant {
        Leash storage leash = _ownedLeash(leashId);
        if (leash.revoked) revert AgentLeashErrors.Revoked();
        _validateLimits(dailyCap, perPaymentLimit);
        leash.dailyCap = dailyCap;
        leash.perPaymentLimit = perPaymentLimit;
        leash.cooldown = cooldownSeconds;
        if (leash.autoApproveLimit > perPaymentLimit) {
            leash.autoApproveLimit = perPaymentLimit;
            emit AutoApproveLimitSet(leashId, perPaymentLimit);
        }
        emit LimitsUpdated(leashId, dailyCap, perPaymentLimit, cooldownSeconds);
    }

    /**
     * @notice Owner creates a recurring payment on an unrevoked, unexpired leash, even while paused.
     * @dev The payee must be nonzero, amount positive and within balanceCap, and
     * interval between MIN_INTERVAL and MAX_INTERVAL inclusive. Zero or past startAt
     * starts now. At most MAX_SCHEDULES may be active. maxRuns == 0 is unlimited.
     * No funds are reserved. Execution bypasses agent limits, allowlist and cooldown.
     * @return scheduleId The new schedule ID, never reused.
     */
    function createSchedule(
        uint256 leashId,
        address payee,
        uint128 amount,
        uint64 interval,
        uint64 startAt,
        uint32 maxRuns
    ) external nonReentrant returns (uint32 scheduleId) {
        Leash storage leash = _ownedLeash(leashId);
        _requireActive(leash);
        if (payee == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > leash.balanceCap) revert BalanceCapExceeded(amount, leash.balanceCap);
        if (interval < MIN_INTERVAL || interval > MAX_INTERVAL) revert InvalidSchedule();
        uint64 nextDue = startAt <= block.timestamp ? uint64(block.timestamp) : startAt;
        if (leash.activeSchedules >= MAX_SCHEDULES) revert TooManySchedules();
        // Checked increment prevents wrapping and reusing an existing schedule ID.
        scheduleId = leash.nextScheduleId++;
        leash.activeSchedules++;
        _schedules[leashId][scheduleId] = Schedule({
            payee: payee,
            amount: amount,
            interval: interval,
            nextDue: nextDue,
            maxRuns: maxRuns,
            runs: 0,
            active: true
        });
        emit ScheduleCreated(leashId, scheduleId, payee, amount, interval, nextDue, maxRuns);
    }

    /// @notice Owner cancels an active schedule, even on a revoked, expired or paused leash.
    /// @dev Cancellation frees one active schedule slot without deleting its history.
    function cancelSchedule(uint256 leashId, uint32 scheduleId) external nonReentrant {
        Leash storage leash = _ownedLeash(leashId);
        Schedule storage schedule = _schedules[leashId][scheduleId];
        if (!schedule.active) revert ScheduleNotActive();
        schedule.active = false;
        leash.activeSchedules--;
        emit ScheduleCancelled(leashId, scheduleId);
    }

    /**
     * @notice Anyone may execute one due payment exactly as authorized by the owner.
     * @dev Checks schedule activity, revocation, expiry, pause, due time and balance
     * in that order. Advances nextDue strictly past now without paying missed periods.
     * Finite schedules deactivate at maxRuns. All effects precede SafeERC20 transfer.
     * Skips allowlist, per-payment and daily limits, and cooldown; does not change
     * the rolling window, lastPaymentAt or payee.spent. Revoked schedules cannot execute.
     */
    function executeSchedule(uint256 leashId, uint32 scheduleId) external nonReentrant {
        Leash storage leash = _getLeash(leashId);
        Schedule storage schedule = _schedules[leashId][scheduleId];
        if (!schedule.active) revert ScheduleNotActive();
        _requireActive(leash);
        if (leash.paused) revert Paused();
        if (block.timestamp < schedule.nextDue) revert ScheduleNotDue(schedule.nextDue);
        if (schedule.amount > leash.balance) revert InsufficientBalance(schedule.amount, leash.balance);

        schedule.runs++;
        schedule.nextDue += schedule.interval * uint64(((block.timestamp - schedule.nextDue) / schedule.interval) + 1);
        if (schedule.maxRuns != 0 && schedule.runs >= schedule.maxRuns) {
            schedule.active = false;
            leash.activeSchedules--;
        }
        leash.balance -= schedule.amount;
        usdc.safeTransfer(schedule.payee, schedule.amount);
        emit ScheduleExecuted(leashId, scheduleId, schedule.payee, schedule.amount, schedule.runs, schedule.nextDue);
    }

    /**
     * @notice Permanently revoke a leash and attempt to refund its entire balance.
     * @dev Revocation is written first; a second revocation reverts. Refund failure
     * never reverses revocation: accounting is restored for a later withdraw().
     * The refund uses a gas-bounded low-level transfer, copying at most 32 return
     * bytes. Success requires an empty return or exactly a canonical true word;
     * malformed/false return data and token reverts are treated as refund failure.
     * The event reports only the amount successfully refunded. Like any transaction,
     * the caller must supply enough gas for the local bookkeeping to finish.
     * Pausing does not block revocation; existing schedules can no longer execute.
     */
    function revoke(uint256 leashId) external nonReentrant {
        Leash storage leash = _ownedLeash(leashId);
        if (leash.revoked) revert AgentLeashErrors.Revoked();
        leash.revoked = true;
        uint128 refund = leash.balance;
        leash.balance = 0;
        if (refund != 0 && !_tryRefund(leash.owner, refund)) {
            leash.balance = refund;
            refund = 0;
        }
        emit Revoked(leashId, refund);
    }

    /// @notice Owner withdraws a positive amount up to its balance, even after expiry/revocation or while paused.
    /// @dev Only this leash's balance is available; accounting precedes SafeERC20 transfer.
    function withdraw(uint256 leashId, uint256 amount) external nonReentrant {
        Leash storage leash = _ownedLeash(leashId);
        if (amount == 0) revert ZeroAmount();
        if (amount > leash.balance) revert InsufficientBalance(amount, leash.balance);
        leash.balance -= uint128(amount);
        usdc.safeTransfer(leash.owner, amount);
        emit Withdrawn(leashId, amount);
    }

    /**
     * @notice Owner consents to one pending request on an active, sufficiently funded leash, even while paused.
     * @dev Skips allowlist, per-payment limits, daily caps and cooldown; does not record
     * rolling spend, payee.spent or change lastPaymentAt. No funds were reserved when queued.
     * Status, pending count and balance are updated before transferring tokens.
     */
    function approve(uint256 leashId, uint32 requestId) external nonReentrant {
        Leash storage leash = _ownedLeash(leashId);
        Request storage request = _requests[leashId][requestId];
        if (request.status != Status.Pending) revert RequestNotPending();
        _requireActive(leash);
        if (request.amount > leash.balance) revert InsufficientBalance(request.amount, leash.balance);
        request.status = Status.Approved;
        leash.pendingCount--;
        leash.balance -= request.amount;
        usdc.safeTransfer(request.payee, request.amount);
        emit Approved(leashId, requestId, request.payee, request.amount);
        emit Paid(leashId, request.payee, request.amount, request.reason, requestId);
    }

    /// @notice Owner rejects a pending request, even when revoked, expired or paused; no tokens move.
    function reject(uint256 leashId, uint32 requestId) external nonReentrant {
        Leash storage leash = _ownedLeash(leashId);
        Request storage request = _requests[leashId][requestId];
        if (request.status != Status.Pending) revert RequestNotPending();
        request.status = Status.Rejected;
        leash.pendingCount--;
        emit Rejected(leashId, requestId);
    }

    /**
     * @notice Agent pays an allowlisted or auto-approved recipient immediately, or queues owner consent.
     * @return requestId Zero for immediate payment, otherwise the new pending request ID.
     * @dev Checks agent, revocation, expiry, pause, nonempty reason, nonzero payee,
     * positive amount and reason <= 280 bytes, in that order. Unknown leashes first
     * revert LeashNotFound. Non-allowlisted recipients queue unless autoApproveLimit
     * is nonzero and amount is within it. Queuing checks neither limits nor balance,
     * reserves no funds and permits at most twenty pending requests.
     * Immediate payments check effective per-payment limit, exact rolling daily cap,
     * enabled fixed-period payee cap, cooldown, then balance. New auto-approved payees
     * use leash defaults without payee overrides and are not added to the allowlist.
     * Each leash has capacity for 32 immediate payments per rolling 24-hour window;
     * after those checks, WindowFull() reverts if no empty or expired entry exists.
     */
    function pay(
        uint256 leashId,
        address payee,
        uint128 amount,
        string calldata reason
    ) external nonReentrant returns (uint32 requestId) {
        Leash storage leash = _getLeash(leashId);
        if (msg.sender != leash.agent) revert NotAgent();
        _requireActive(leash);
        if (leash.paused) revert Paused();
        if (bytes(reason).length == 0) revert ZeroReason();
        if (payee == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (bytes(reason).length > MAX_REASON_LENGTH) {
            revert ReasonTooLong(bytes(reason).length, MAX_REASON_LENGTH);
        }
        if (!_payees[leashId][payee].allowed && (leash.autoApproveLimit == 0 || amount > leash.autoApproveLimit)) {
            if (leash.pendingCount >= MAX_PENDING) revert TooManyPending();
            // Checked increment prevents wrapping and reusing an existing request ID.
            requestId = leash.nextRequestId++;
            leash.pendingCount++;
            _requests[leashId][requestId] = Request({
                payee: payee,
                amount: amount,
                createdAt: uint64(block.timestamp),
                status: Status.Pending,
                reason: reason
            });
            emit Queued(leashId, requestId, payee, amount, reason);
            return requestId;
        }
        _payImmediately(leashId, leash, payee, amount, reason);
        return 0;
    }

    /// @notice Return the complete leash, including appended configuration; unknown IDs revert LeashNotFound.
    function getLeash(uint256 leashId) external view returns (Leash memory) {
        return _getLeash(leashId);
    }

    /// @notice Return allowlist membership; unknown leash IDs revert LeashNotFound.
    function isPayee(uint256 leashId, address payee) external view returns (bool) {
        _getLeash(leashId);
        return _payees[leashId][payee].allowed;
    }

    /// @notice Return stored payee configuration; unknown leash IDs revert LeashNotFound.
    /// @dev An elapsed period is reset only by a successful immediate payment, not this view.
    function payeeConfig(uint256 leashId, address payee) external view returns (PayeeConfig memory) {
        _getLeash(leashId);
        return _payees[leashId][payee];
    }

    /// @notice Return a schedule; unused IDs return an empty struct, unknown leashes revert LeashNotFound.
    function getSchedule(uint256 leashId, uint32 scheduleId) external view returns (Schedule memory) {
        _getLeash(leashId);
        return _schedules[leashId][scheduleId];
    }

    /// @notice Return a request, or Status.None for an unused ID on an existing leash.
    function getRequest(uint256 leashId, uint32 requestId) external view returns (Request memory) {
        _getLeash(leashId);
        return _requests[leashId][requestId];
    }

    /// @notice Exact rolling 24-hour immediate-agent spend, with capacity for 32 payments.
    /// @dev Each payment expires individually after 24 hours; new immediate payments
    /// revert WindowFull() while all 32 entries remain within the window.
    function spentInWindow(uint256 leashId) public view returns (uint256) {
        _getLeash(leashId);
        return _spentInWindow(leashId);
    }

    /// @notice Daily cap minus exact rolling 24-hour spend, floored at zero, even after limit reductions.
    function remainingDaily(uint256 leashId) external view returns (uint256) {
        Leash storage leash = _getLeash(leashId);
        uint256 spent = _spentInWindow(leashId);
        return spent >= leash.dailyCap ? 0 : uint256(leash.dailyCap) - spent;
    }

    function _getLeash(uint256 leashId) private view returns (Leash storage leash) {
        leash = _leashes[leashId];
        if (leash.owner == address(0)) revert LeashNotFound();
    }

    function _ownedLeash(uint256 leashId) private view returns (Leash storage leash) {
        leash = _getLeash(leashId);
        if (msg.sender != leash.owner) revert NotOwner();
    }

    function _requireActive(Leash storage leash) private view {
        if (leash.revoked) revert AgentLeashErrors.Revoked();
        if (block.timestamp >= leash.expiresAt) revert Expired();
    }

    function _validateLimits(uint128 dailyCap, uint128 perPaymentLimit) private pure {
        if (dailyCap == 0 || perPaymentLimit == 0 || perPaymentLimit > dailyCap) revert InvalidLimits();
    }

    function _addInitialPayees(uint256 leashId, address[] calldata payees) private {
        for (uint256 i; i < payees.length; ++i) {
            if (payees[i] == address(0)) revert ZeroAddress();
            _payees[leashId][payees[i]].allowed = true;
            emit PayeeAdded(leashId, payees[i]);
        }
    }

    function _emitLeashCreated(uint256 leashId, Leash storage leash) private {
        emit LeashCreated(
            leashId,
            leash.owner,
            leash.agent,
            leash.dailyCap,
            leash.perPaymentLimit,
            leash.cooldown,
            leash.expiresAt,
            leash.balanceCap
        );
    }

    function _spentInWindow(uint256 leashId) private view returns (uint256 spent) {
        for (uint256 i; i < WINDOW_SLOTS; ++i) {
            Entry storage entry = _window[leashId][i];
            if (entry.amount != 0 && block.timestamp < uint256(entry.ts) + 1 days) {
                spent += entry.amount;
            }
        }
    }

    /// @dev Checks payee-period resets in memory and persists them only with payment effects.
    /// Every immediate payment records exactly one entry in the unchanged 32-slot window.
    function _payImmediately(
        uint256 leashId,
        Leash storage leash,
        address payee,
        uint128 amount,
        string calldata reason
    ) private {
        PayeeConfig memory config = _payees[leashId][payee];
        {
            uint128 effectiveLimit = config.allowed && config.perPaymentLimit != 0
                ? config.perPaymentLimit
                : leash.perPaymentLimit;
            if (amount > effectiveLimit) revert OverPerPaymentLimit(amount, effectiveLimit);
        }
        {
            uint256 spent = _spentInWindow(leashId);
            if (spent + amount > leash.dailyCap) {
                uint256 remaining = spent >= leash.dailyCap ? 0 : uint256(leash.dailyCap) - spent;
                revert OverDailyCap(amount, remaining);
            }
        }
        if (config.allowed && config.dailyCap != 0) {
            if (config.periodStart == 0 || block.timestamp >= uint256(config.periodStart) + 1 days) {
                config.spent = 0;
                config.periodStart = uint64(block.timestamp);
            }
            if (uint256(config.spent) + amount > config.dailyCap) {
                uint256 remaining = config.spent >= config.dailyCap ? 0 : uint256(config.dailyCap) - config.spent;
                revert OverPayeeDailyCap(amount, remaining);
            }
        }
        {
            uint256 availableAt = uint256(leash.lastPaymentAt) + leash.cooldown;
            if (leash.lastPaymentAt != 0 && block.timestamp < availableAt) revert CooldownActive(availableAt);
        }
        if (amount > leash.balance) revert InsufficientBalance(amount, leash.balance);

        uint256 slot = WINDOW_SLOTS;
        for (uint256 i; i < WINDOW_SLOTS; ++i) {
            Entry storage entry = _window[leashId][i];
            if (entry.amount == 0 || block.timestamp >= uint256(entry.ts) + 1 days) {
                slot = i;
                break;
            }
        }
        if (slot == WINDOW_SLOTS) revert WindowFull();
        _window[leashId][slot] = Entry({ts: uint64(block.timestamp), amount: uint192(amount)});
        leash.balance -= amount;
        leash.lastPaymentAt = uint64(block.timestamp);
        if (config.allowed && config.dailyCap != 0) {
            _payees[leashId][payee].spent = config.spent + amount;
            _payees[leashId][payee].periodStart = config.periodStart;
        }
        usdc.safeTransfer(payee, amount);
        emit Paid(leashId, payee, amount, reason, 0);
    }

    /// @dev Fixed-size return buffer prevents a token's oversized returndata from
    /// blocking revocation. Checking word == 1 also avoids abi.decode(bool) reverting
    /// on malformed booleans. Assembly performs only the bounded token call and
    /// validates its return data; leash accounting is handled by revoke().
    function _tryRefund(address recipient, uint256 amount) private returns (bool success) {
        bytes memory data = abi.encodeCall(IERC20.transfer, (recipient, amount));
        address token = address(usdc);
        uint256 gasLimit = REFUND_GAS_LIMIT;
        assembly ("memory-safe") {
            let output := mload(0x40)
            mstore(output, 0)
            let ok := call(gasLimit, token, 0, add(data, 0x20), mload(data), output, 0x20)
            let size := returndatasize()
            success := and(ok, or(iszero(size), and(eq(size, 0x20), eq(mload(output), 1))))
        }
    }
}
