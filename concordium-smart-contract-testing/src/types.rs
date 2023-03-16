use std::{collections::BTreeMap, path::PathBuf, sync::Arc};
use thiserror::Error;

use concordium_base::{
    base::Energy,
    contracts_common::{
        AccountAddress, AccountBalance, Address, Amount, ContractAddress, ExchangeRate,
        ModuleReference, OwnedContractName, OwnedEntrypointName, SlotTime,
    },
    smart_contracts::WasmVersion,
};
use concordium_smart_contract_engine::{
    v0,
    v1::{self, trie, ReturnValue},
};
use concordium_wasm::artifact;

/// A smart contract module.
#[derive(Debug, Clone)]
pub struct ContractModule {
    /// Size of the module in bytes. Used for cost accounting.
    pub(crate) size:     u64,
    /// The runnable module.
    pub(crate) artifact: Arc<artifact::Artifact<v1::ProcessedImports, artifact::CompiledFunction>>,
}

/// Represents the block chain and supports a number of operations, including
/// creating accounts, deploying modules, initializing contract, updating
/// contracts and invoking contracts.
pub struct Chain {
    /// The block time viewable inside the smart contracts.
    /// Defaults to `0`.
    pub block_time:          SlotTime,
    /// MicroCCD per Euro ratio.
    pub micro_ccd_per_euro:  ExchangeRate,
    /// Euro per Energy ratio.
    pub euro_per_energy:     ExchangeRate,
    /// Accounts and info about them.
    pub accounts:            BTreeMap<AccountAddress, Account>,
    /// Smart contract modules.
    pub modules:             BTreeMap<ModuleReference, ContractModule>,
    /// Smart contract instances.
    pub contracts:           BTreeMap<ContractAddress, Contract>,
    /// Next contract index to use when creating a new instance.
    pub next_contract_index: u64,
}

/// A smart contract instance.
#[derive(Clone)]
pub struct Contract {
    /// The module which contains this contract.
    pub module_reference: ModuleReference,
    /// The name of the contract.
    pub contract_name:    OwnedContractName,
    /// The contract state.
    pub state:            trie::PersistentState,
    /// The owner of the contract.
    pub owner:            AccountAddress,
    /// The balance of the contract.
    pub self_balance:     Amount,
}

/// Account policies for testing.
#[derive(Clone, Debug)]
pub struct TestPolicies(pub Vec<u8>);

/// An account.
#[derive(Clone)]
pub struct Account {
    /// The account balance.
    pub balance:         AccountBalance,
    /// Account policies.
    pub policies:        Vec<u8>, // TODO: Decide how policies should be represented.
    /// The number of signatures. The number of signatures affect the cost of
    /// every transaction for the account.
    pub signature_count: u32,
}

/// An event that occurred during a contract update or invocation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChainEvent {
    /// A contract was interrupted.
    Interrupted {
        /// The contract interrupted.
        address: ContractAddress,
        /// Logs produced prior to being interrupted.
        logs:    v0::Logs,
    },
    /// A contract was resumed after being interrupted.
    Resumed {
        /// The contract resumed.
        address: ContractAddress,
        /// Whether the action that caused the interrupt succeeded.
        success: bool,
    },
    /// A contract was upgraded.
    Upgraded {
        /// The contract upgraded.
        address: ContractAddress,
        /// The old module reference.
        from:    ModuleReference,
        /// The new module reference.
        to:      ModuleReference,
    },
    /// A contract was updated.
    Updated {
        /// The contract updated.
        address:    ContractAddress,
        /// The name of the contract.
        contract:   OwnedContractName,
        /// The entrypoint called.
        entrypoint: OwnedEntrypointName,
        /// The amount added to the contract.
        amount:     Amount,
    },
    /// A contract transferred an [`Amount`] to an account.
    Transferred {
        /// The sender contract.
        from:   ContractAddress,
        /// The [`Amount`] transferred.
        amount: Amount,
        /// The receiver account.
        to:     AccountAddress,
    },
}

/// A transfer from an contract to an account.
#[derive(Debug, PartialEq, Eq)]
pub struct Transfer {
    /// The sender contract.
    pub from:   ContractAddress,
    /// The amount transferred.
    pub amount: Amount,
    /// The receive account.
    pub to:     AccountAddress,
}

/// Represents a successful deployment of a [`ContractModule`].
#[derive(Debug, PartialEq, Eq)]
pub struct SuccessfulModuleDeployment {
    /// The reference of the module deployed.
    pub module_reference: ModuleReference,
    /// The energy used for deployment.
    pub energy_used:      Energy,
    /// Cost of transaction.
    pub transaction_fee:  Amount,
}

/// An error that occured while deploying a [`ContractModule`].
#[derive(Debug)]
pub struct ModuleDeployError {
    /// The energy used for deployment.
    pub energy_used:     Energy,
    /// The transaction fee. This is the amount charged to the `sender`
    /// account.
    pub transaction_fee: Amount,
    /// The specific reason for why the deployment failed.
    pub kind:            ModuleDeployErrorKind,
}

/// The specific kind of error that occured while deploying a
/// [`ContractModule`].
#[derive(Debug, Error)]
pub enum ModuleDeployErrorKind {
    /// The module provided is not valid.
    #[error("module is invalid due to: {0}")]
    InvalidModule(#[from] InvalidModuleError),
    /// The sender account does not have sufficient funds to pay for the
    /// deployment.
    #[error("sender does not have sufficient funds to pay for the energy")]
    InsufficientFunds,
    /// The sender account deploying the module does not exist.
    #[error("sender account {} does not exist", 0.0)]
    SenderDoesNotExist(#[from] AccountMissing),
    /// The module has already been deployed.
    #[error("module with reference {:?} already exists", 0)]
    DuplicateModule(ModuleReference),
    /// The module version is not supported.
    #[error("wasm version {0} is not supported")]
    UnsupportedModuleVersion(WasmVersion),
}

/// An error that can occur while loading a smart contract module.
#[derive(Debug, Error)]
pub enum ModuleLoadError {
    /// Failed to read the module file.
    #[error("could not read the file '{path}' due to: {error}")]
    ReadFileError {
        path:  PathBuf,
        error: std::io::Error,
    },
    /// The module version is not supported.
    #[error("wasm version {0} is not supported")]
    UnsupportedModuleVersion(WasmVersion),
    /// The module provided is not valid.
    #[error("module is invalid due to: {0}")]
    InvalidModule(#[from] InvalidModuleError),
}

/// The error produced when trying to load or deploy an invalid smart contract
/// module.
#[derive(Debug, Error)]
#[error("The module is invalid due to: {0}")]
pub struct InvalidModuleError(pub(crate) anyhow::Error);

/// Represents a successful initialization of a contract.
#[derive(Debug)]
pub struct ContractInitSuccess {
    /// The address of the new instance.
    pub contract_address: ContractAddress,
    /// Logs produced during initialization.
    pub logs:             v0::Logs,
    /// Energy used.
    pub energy_used:      Energy,
    /// Cost of transaction.
    pub transaction_fee:  Amount,
}

/// An error that occured in [`Chain::contract_init`].
#[derive(Debug)]
pub struct ContractInitError {
    /// Energy used.
    pub energy_used:     Energy,
    /// The transaction fee. This is the amount charged to the `sender`
    /// account.
    pub transaction_fee: Amount,
    /// The specific reason for why the initialization failed.
    pub kind:            ContractInitErrorKind,
}

/// Types of errors that can occur in [`Chain::contract_init`].
#[derive(Debug, Error)]
pub enum ContractInitErrorKind {
    /// Initialization failed for a reason that also exists on the chain.
    #[error("failed due to a valid chain error: {:?}", 0)]
    ExecutionError {
        /// The reason for why the contract initialization failed.
        failure_kind: InitFailure,
    },
    /// Ran out of energy.
    #[error("ran out of energy")]
    OutOfEnergy,
    /// Module has not been deployed in the test environment.
    #[error("module {:?} does not exist", 0.0)]
    ModuleDoesNotExist(#[from] ModuleMissing),
    /// The sender account has not been created in test environment.
    #[error("sender account {} does not exist", 0.0)]
    SenderDoesNotExist(#[from] AccountMissing),
    /// The invoker account does not have enough funds to pay for the energy.
    #[error("invoker does not have enough funds to pay for the energy")]
    InsufficientFunds,
    /// The parameter is too large.
    #[error("the provided parameter exceeds the max size allowed")]
    ParameterTooLarge,
}

/// The reason for why a contract initialization failed during execution.
#[derive(Debug)]
pub enum InitFailure {
    /// The contract rejected.
    Reject {
        /// The error code for why it rejected.
        reason:       i32,
        /// The return value.
        return_value: ReturnValue,
    },
    /// The contract trapped.
    Trap,
    /// The contract ran out of energy.
    OutOfEnergy,
}

/// Represents a successful contract update (or invocation).
// TODO: Consider adding function to aggregate all logs from the host_events.
#[derive(Debug)]
pub struct ContractInvocationSuccess {
    /// Host events that occured. This includes interrupts, resumes, and
    /// upgrades.
    pub chain_events:    Vec<ChainEvent>,
    /// Energy used.
    pub energy_used:     Energy,
    /// Cost of transaction.
    pub transaction_fee: Amount,
    /// The returned value.
    pub return_value:    ReturnValue,
    /// Whether the state was changed.
    pub state_changed:   bool,
    /// The new balance of the smart contract.
    pub new_balance:     Amount,
    /// The logs produced since the last interrupt.
    pub logs:            v0::Logs,
}

/// An error that occured during a [`Chain::contract_update`] or
/// [`Chain::contract_invoke`].
#[derive(Debug)]
pub struct ContractInvocationError {
    /// The energy used.
    pub energy_used:     Energy,
    /// The transaction fee. For [`Chain::contract_update`], this is the amount
    /// charged to the `invoker` account.
    pub transaction_fee: Amount,
    /// The specific reason for why the invocation failed.
    pub kind:            ContractInvocationErrorKind,
}

/// The error kinds that can occur during [`Chain::contract_update`] or
/// [`Chain::contract_invoke`].
#[derive(Debug, Error)]
pub enum ContractInvocationErrorKind {
    /// Update failed for a reason that also exists on the chain.
    #[error("failed during execution")]
    ExecutionError { failure_kind: v1::InvokeFailure },
    /// Ran out of energy.
    #[error("ran out of energy")]
    OutOfEnergy,
    /// Module has not been deployed in test environment.
    #[error("module {:?} does not exist", 0.0)]
    ModuleDoesNotExist(#[from] ModuleMissing),
    /// Contract instance has not been initialized in the test environment.
    #[error("instance {} does not exist", 0.0)]
    InstanceDoesNotExist(#[from] ContractInstanceMissing),
    /// Entrypoint does not exist and neither does the fallback entrypoint.
    #[error("entrypoint does not exist")]
    EntrypointDoesNotExist(#[from] EntrypointDoesNotExist),
    /// The invoker account has not been created in the test environment.
    #[error("invoker account {} does not exist", 0.0)]
    InvokerDoesNotExist(#[from] AccountMissing),
    /// The sender does not exist in the test environment.
    #[error("sender {0} does not exist")]
    SenderDoesNotExist(Address),
    /// The invoker account does not have enough funds to pay for the energy and
    /// amount sent.
    #[error("invoker does not have enough funds to pay for the energy")]
    InsufficientFunds,
    /// The parameter is too large.
    #[error("the provided parameter exceeds the max size allowed")]
    ParameterTooLarge,
}

/// A transfer of [`Amount`]s failed because the sender had insufficient
/// balance.
#[derive(Debug)]
pub(crate) struct InsufficientBalanceError;

/// Errors related to transfers.
#[derive(PartialEq, Eq, Debug, Error)]
pub(crate) enum TransferError {
    /// The receiver does not exist.
    #[error("The receiver does not exist.")]
    ToMissing,
    /// The sender does not have sufficient balance.
    #[error("The sender does not have sufficient balance.")]
    InsufficientBalance,
}

/// The entrypoint does not exist.
#[derive(PartialEq, Eq, Debug, Error)]
#[error("The entrypoint '{0}' does not exist.")]
pub struct EntrypointDoesNotExist(pub OwnedEntrypointName);

/// The contract module does not exist.
#[derive(Debug, Error)]
#[error("Module {:?} does not exist.", 0)]
pub struct ModuleMissing(pub ModuleReference);

/// The contract instance does not exist.
#[derive(Debug, Error)]
#[error("Contract instance {0} does not exist.")]
pub struct ContractInstanceMissing(pub ContractAddress);

/// The account does not exist.
#[derive(Debug, Error)]
#[error("Account {0} does not exist.")]
pub struct AccountMissing(pub AccountAddress);
