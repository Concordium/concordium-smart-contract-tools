use crate::{
    constants,
    invocation::{
        ChangeSet, EntrypointInvocationHandler, InvokeEntrypointResponse, TestConfigurationError,
    },
    types::*,
};
use anyhow::anyhow;
use concordium_base::{
    base::{Energy, OutOfEnergy},
    constants::{MAX_ALLOWED_INVOKE_ENERGY, MAX_WASM_MODULE_SIZE},
    contracts_common::{
        self, AccountAddress, AccountBalance, Address, Amount, ChainMetadata, ContractAddress,
        ExchangeRate, ModuleReference, OwnedPolicy, SlotTime, Timestamp,
    },
    smart_contracts::{
        ContractEvent, ContractTraceElement, InstanceUpdatedEvent, ModuleSource, WasmModule,
        WasmVersion,
    },
    transactions::{self, cost, InitContractPayload, UpdateContractPayload},
};
use concordium_smart_contract_engine::{v0, v1, InterpreterEnergy};
use num_bigint::BigUint;
use std::{collections::BTreeMap, path::Path, sync::Arc};

impl Default for Chain {
    fn default() -> Self { Self::new() }
}

impl ChainParameters {
    /// Create a new [`ChainParameters`](Self) where
    ///  - `block_time` defaults to `0`,
    ///  - `micro_ccd_per_euro` defaults to `50000 / 1`
    ///  - `euro_per_energy` defaults to `1 / 50000`.
    ///
    /// With these exchange rates, one energy costs one microCCD.
    pub fn new() -> Self {
        Self::new_with_time_and_rates(
            Timestamp::from_timestamp_millis(0),
            ExchangeRate::new_unchecked(50000, 1),
            ExchangeRate::new_unchecked(1, 50000),
        )
        .expect("Parameters are in range.")
    }

    /// Create a new [`ChainParameters`](Self) with a specified `block_time`
    /// where
    ///  - `micro_ccd_per_euro` defaults to `147235241 / 1`
    ///  - `euro_per_energy` defaults to `1 / 50000`.
    pub fn new_with_time(block_time: SlotTime) -> Self {
        Self {
            block_time,
            ..Self::new()
        }
    }

    /// Create a new [`ChainParameters`](Self) where all the configurable
    /// parameters are provided.
    ///
    /// Returns an error if the exchange rates provided makes one energy cost
    /// more than `u64::MAX / ` [`MAX_ALLOWED_INVOKE_ENERGY`].
    pub fn new_with_time_and_rates(
        block_time: SlotTime,
        micro_ccd_per_euro: ExchangeRate,
        euro_per_energy: ExchangeRate,
    ) -> Result<Self, ExchangeRateError> {
        // Ensure the exchange rates are within a valid range.
        check_exchange_rates(euro_per_energy, micro_ccd_per_euro)?;

        Ok(Self {
            block_time,
            micro_ccd_per_euro,
            euro_per_energy,
        })
    }

    /// Helper function for converting [`Energy`] to [`Amount`] using the two
    /// [`ExchangeRate`]s `euro_per_energy` and `micro_ccd_per_euro`.
    pub fn calculate_energy_cost(&self, energy: Energy) -> Amount {
        energy_to_amount(energy, self.euro_per_energy, self.micro_ccd_per_euro)
    }
}

impl Chain {
    /// Create a new [`Chain`](Self) where all the configurable parameters are
    /// provided.
    ///
    /// Returns an error if the exchange rates provided makes one energy cost
    /// more than `u64::MAX / ` [`MAX_ALLOWED_INVOKE_ENERGY`].
    pub fn new_with_time_and_rates(
        block_time: SlotTime,
        micro_ccd_per_euro: ExchangeRate,
        euro_per_energy: ExchangeRate,
    ) -> Result<Self, ExchangeRateError> {
        Ok(Self {
            parameters:          ChainParameters::new_with_time_and_rates(
                block_time,
                micro_ccd_per_euro,
                euro_per_energy,
            )?,
            accounts:            BTreeMap::new(),
            modules:             BTreeMap::new(),
            contracts:           BTreeMap::new(),
            next_contract_index: 0,
        })
    }

    /// Create a new [`Chain`](Self) with a specified `block_time` where
    ///  - `micro_ccd_per_euro` defaults to `147235241 / 1`
    ///  - `euro_per_energy` defaults to `1 / 50000`.
    pub fn new_with_time(block_time: SlotTime) -> Self {
        Self {
            parameters: ChainParameters::new_with_time(block_time),
            ..Self::new()
        }
    }

    /// Create a new [`Chain`](Self) where
    ///  - `block_time` defaults to `0`,
    ///  - `micro_ccd_per_euro` defaults to `50000 / 1`
    ///  - `euro_per_energy` defaults to `1 / 50000`.
    ///
    /// With these exchange rates, one energy costs one microCCD.
    pub fn new() -> Self {
        Self::new_with_time_and_rates(
            Timestamp::from_timestamp_millis(0),
            ExchangeRate::new_unchecked(50000, 1),
            ExchangeRate::new_unchecked(1, 50000),
        )
        .expect("Rates known to be within range.")
    }

    /// Helper function for converting [`Energy`] to [`Amount`] using the two
    /// [`ExchangeRate`]s `euro_per_energy` and `micro_ccd_per_euro`.
    pub fn calculate_energy_cost(&self, energy: Energy) -> Amount {
        self.parameters.calculate_energy_cost(energy)
    }

    /// Get the state of the contract if it exists in the [`Chain`](Self).
    pub fn get_contract(&self, address: ContractAddress) -> Option<&Contract> {
        self.contracts.get(&address)
    }

    /// Get the the module if it exists in the [`Chain`](Self).
    pub fn get_module(&self, module: ModuleReference) -> Option<&ContractModule> {
        self.modules.get(&module)
    }

    /// Get the state of the account if it exists in the [`Chain`](Self).
    /// Account addresses that are aliases will return the same account.
    pub fn get_account(&self, address: AccountAddress) -> Option<&Account> {
        self.accounts.get(&address.into())
    }

    /// Deploy a smart contract module.
    ///
    /// The `WasmModule` can be loaded from disk with either
    /// [`Chain::module_load_v1`] or [`Chain::module_load_v1_raw`].
    ///
    /// Parameters:
    ///  - `signer`: the signer with a number of keys, which affects the cost.
    ///  - `sender`: the sender account.
    ///  - `module`: the v1 wasm module.
    pub fn module_deploy_v1(
        &mut self,
        signer: Signer,
        sender: AccountAddress,
        wasm_module: WasmModule,
    ) -> Result<ModuleDeploySuccess, ModuleDeployError> {
        let Ok(sender_account) = self.accounts
            .get_mut(&sender.into())
            .ok_or(AccountDoesNotExist { address: sender }) else {
            // Ensure sender account exists.
            return Err(ModuleDeployError {
                kind:            ModuleDeployErrorKind::SenderDoesNotExist(AccountDoesNotExist {
                    address: sender,
                }),
                energy_used:     0.into(),
                transaction_fee: Amount::zero(),
            });
        };

        let parameters = &self.parameters;
        let check_header_energy = {
            // +1 for the tag, +8 for size and version
            let payload_size = 1
                + 8
                + wasm_module.source.size()
                + transactions::construct::TRANSACTION_HEADER_SIZE;
            cost::base_cost(payload_size, signer.num_keys)
        };
        let check_header_cost = parameters.calculate_energy_cost(check_header_energy);

        if sender_account.balance.available() < check_header_cost {
            return Err(ModuleDeployError {
                kind:            ModuleDeployErrorKind::InsufficientFunds,
                energy_used:     0.into(),
                transaction_fee: Amount::zero(),
            });
        }

        // Only v1 modules are supported in this testing library.
        if wasm_module.version != WasmVersion::V1 {
            return Err(ModuleDeployError {
                kind:            ModuleDeployErrorKind::UnsupportedModuleVersion(
                    wasm_module.version,
                ),
                energy_used:     0.into(),
                transaction_fee: Amount::zero(),
            });
        }

        let account = sender_account;

        // TODO: Ensure that this matches the node for both invalid and valid modules.
        // to_ccd(header_cost) + to_ccd(deploy_cost) != to_ccd(header_cost +
        // deploy_cost).
        account.balance.total -= check_header_cost;

        // Construct the artifact.
        let artifact =
            match concordium_wasm::utils::instantiate_with_metering::<v1::ProcessedImports, _>(
                &v1::ConcordiumAllowedImports {
                    support_upgrade: true,
                },
                wasm_module.source.as_ref(),
            ) {
                Ok(artifact) => artifact,
                Err(err) => {
                    return Err(ModuleDeployError {
                        kind:            ModuleInvalidError(err).into(),
                        energy_used:     check_header_energy,
                        transaction_fee: check_header_cost,
                    })
                }
            };

        // Calculate the deploy module cost.
        let deploy_module_energy = cost::deploy_module(wasm_module.source.size());
        let deploy_module_cost = parameters.calculate_energy_cost(deploy_module_energy);

        // Subtract the cost from the account if it has sufficient funds.
        if account.balance.available() < deploy_module_cost {
            return Err(ModuleDeployError {
                kind:            ModuleDeployErrorKind::InsufficientFunds,
                energy_used:     check_header_energy,
                transaction_fee: check_header_cost,
            });
        };
        account.balance.total -= deploy_module_cost;

        // Save the module.
        let module_reference: ModuleReference = wasm_module.get_module_ref();

        // Ensure module hasn't been deployed before.
        if self.modules.contains_key(&module_reference) {
            return Err(ModuleDeployError {
                kind:            ModuleDeployErrorKind::DuplicateModule(module_reference),
                energy_used:     check_header_energy + deploy_module_energy,
                transaction_fee: check_header_cost + deploy_module_cost,
            });
        }
        self.modules.insert(module_reference, ContractModule {
            size:     wasm_module.source.size(),
            artifact: Arc::new(artifact),
        });
        Ok(ModuleDeploySuccess {
            module_reference,
            energy_used: check_header_energy + deploy_module_energy,
            transaction_fee: check_header_cost + deploy_module_cost,
        })
    }

    /// Load a raw wasm module, i.e. one **without** the prefix of 4 version
    /// bytes and 4 module length bytes.
    /// The module still has to be a valid V1 smart contract module.
    pub fn module_load_v1_raw(
        module_path: impl AsRef<Path>,
    ) -> Result<WasmModule, ModuleLoadError> {
        let module_path = module_path.as_ref();
        // To avoid reading a giant file, we open the file for reading, check its size
        // and then load the contents.
        let (mut reader, metadata) = std::fs::File::open(module_path)
            .and_then(|reader| reader.metadata().map(|metadata| (reader, metadata)))
            .map_err(|e| ModuleLoadError {
                path: module_path.to_path_buf(),
                kind: e.into(),
            })?;
        if metadata.len() > MAX_WASM_MODULE_SIZE.into() {
            return Err(ModuleLoadError {
                path: module_path.to_path_buf(),
                kind: ModuleLoadErrorKind::ReadModule(
                    anyhow!("Maximum size of a Wasm module is {}", MAX_WASM_MODULE_SIZE).into(),
                ),
            });
        }
        // We cannot deserialize directly to [`ModuleSource`] as it expects the first
        // four bytes to be the length, which is isn't for this raw file.
        let mut buffer = Vec::new();
        std::io::Read::read_to_end(&mut reader, &mut buffer).map_err(|e| ModuleLoadError {
            path: module_path.to_path_buf(),
            kind: ModuleLoadErrorKind::OpenFile(e.into()), /* This is unlikely to happen, since
                                                            * we already opened it. */
        })?;
        Ok(WasmModule {
            version: WasmVersion::V1,
            source:  ModuleSource::from(buffer),
        })
    }

    /// Load a v1 wasm module as it is output from `cargo concordium build`,
    /// i.e. **including** the prefix of 4 version bytes and 4 module length
    /// bytes.
    pub fn module_load_v1(module_path: impl AsRef<Path>) -> Result<WasmModule, ModuleLoadError> {
        let module_path = module_path.as_ref();
        // To avoid reading a giant file, we just open the file for reading and then
        // parse it as a wasm module, which checks the length up front.
        let mut reader = std::fs::File::open(module_path).map_err(|e| ModuleLoadError {
            path: module_path.to_path_buf(),
            kind: e.into(),
        })?;
        let module: WasmModule =
            concordium_base::common::from_bytes(&mut reader).map_err(|e| ModuleLoadError {
                path: module_path.to_path_buf(),
                kind: ModuleLoadErrorKind::ReadModule(e.into()),
            })?;
        if module.version != WasmVersion::V1 {
            return Err(ModuleLoadError {
                path: module_path.to_path_buf(),
                kind: ModuleLoadErrorKind::UnsupportedModuleVersion(module.version),
            });
        }
        Ok(module)
    }

    /// Initialize a contract.
    ///
    /// **Parameters:**
    ///  - `signer`: the signer with a number of keys, which affects the cost.
    ///  - `sender`: The account paying for the transaction. Will also become
    ///    the owner of the contract created.
    ///  - `energy_reserved`: Amount of energy reserved for executing the init
    ///   method.
    ///  - `payload`:
    ///    - `amount`: The initial balance of the contract. Subtracted from the
    ///      `sender` account.
    ///    - `mod_ref`: The reference to the a module that has already been
    ///      deployed.
    ///    - `init_name`: Name of the contract to initialize.
    ///    - `param`: Parameter provided to the init method.
    pub fn contract_init(
        &mut self,
        signer: Signer,
        sender: AccountAddress,
        energy_reserved: Energy,
        payload: InitContractPayload,
    ) -> Result<ContractInitSuccess, ContractInitError> {
        let mut remaining_energy = energy_reserved;
        if !self.account_exists(sender) {
            return Err(self.from_init_error_kind(
                ContractInitErrorKind::SenderDoesNotExist(AccountDoesNotExist { address: sender }),
                energy_reserved,
                remaining_energy,
            ));
        }

        let res = self.contract_init_worker(
            signer,
            sender,
            energy_reserved,
            payload,
            &mut remaining_energy,
        );

        let (res, transaction_fee) = match res {
            Ok(s) => {
                let transaction_fee = s.transaction_fee;
                (Ok(s), transaction_fee)
            }
            Err(e) => {
                let err = self.from_init_error_kind(e, energy_reserved, remaining_energy);
                let transaction_fee = err.transaction_fee;
                (Err(err), transaction_fee)
            }
        };

        // Charge the account.
        self.account_mut(sender)
            .expect("existence already checked")
            .balance
            .total -= transaction_fee;
        res
    }

    /// Helper method for initializing contracts, which does most of the actual
    /// work.
    ///
    /// The main reason for splitting init in two is to have this method return
    /// early if it runs out of energy. `contract_init` will then always
    /// ensure to charge the account for the energy used.
    fn contract_init_worker(
        &mut self,
        signer: Signer,
        sender: AccountAddress,
        energy_reserved: Energy,
        payload: InitContractPayload,
        remaining_energy: &mut Energy,
    ) -> Result<ContractInitSuccess, ContractInitErrorKind> {
        // Get the account and check that it has sufficient balance to pay for the
        // reserved_energy and amount.
        let account_info = self.account(sender)?;
        if account_info.balance.available()
            < self.parameters.calculate_energy_cost(energy_reserved) + payload.amount
        {
            return Err(ContractInitErrorKind::InsufficientFunds);
        }

        // Ensure that the parameter has a valid size.
        if payload.param.as_ref().len() > contracts_common::constants::MAX_PARAMETER_LEN {
            return Err(ContractInitErrorKind::ParameterTooLarge);
        }

        // Compute the base cost for checking the transaction header.
        let check_header_cost = {
            // 1 byte for the tag.
            let transaction_size =
                transactions::construct::TRANSACTION_HEADER_SIZE + 1 + payload.size() as u64;
            transactions::cost::base_cost(transaction_size, signer.num_keys)
        };

        // Charge the header cost.
        remaining_energy.tick_energy(check_header_cost)?;

        // Charge the base cost for initializing a contract.
        remaining_energy.tick_energy(constants::INITIALIZE_CONTRACT_INSTANCE_BASE_COST)?;

        // Lookup module.
        let module = self.contract_module(payload.mod_ref)?;
        let lookup_cost = lookup_module_cost(&module);
        // Charge the cost for looking up the module.
        remaining_energy.tick_energy(lookup_cost)?;

        // Construct the context.
        let init_ctx = v0::InitContext {
            metadata:        ChainMetadata {
                slot_time: self.parameters.block_time,
            },
            init_origin:     sender,
            sender_policies: contracts_common::to_bytes(&account_info.policy),
        };
        // Initialize contract
        // We create an empty loader as no caching is used in this testing library
        // presently, so the loader is not used.
        let mut loader = v1::trie::Loader::new(&[][..]);

        let energy_given_to_interpreter = to_interpreter_energy(*remaining_energy);
        let res = v1::invoke_init(
            module.artifact,
            init_ctx,
            v1::InitInvocation {
                amount:    payload.amount,
                init_name: payload.init_name.as_contract_name().get_chain_name(),
                parameter: payload.param.as_ref(),
                energy:    energy_given_to_interpreter,
            },
            false, // We only support protocol P5 and up, so no limiting.
            loader,
        );
        // Handle the result
        match res {
            Ok(v1::InitResult::Success {
                logs,
                return_value: _, /* Ignore return value for now, since our tools do not support
                                  * it for inits, currently. */
                remaining_energy: remaining_interpreter_energy,
                mut state,
            }) => {
                let contract_address = self.create_contract_address();
                let mut collector = v1::trie::SizeCollector::default();

                let persisted_state = state.freeze(&mut loader, &mut collector);

                // Perform the subtraction in the more finegrained (*1000) `InterpreterEnergy`,
                // and *then* convert to `Energy`. This is how it is done in the node, and if we
                // swap the operations, it can result in a small discrepancy due to rounding.
                let energy_used_in_interpreter = from_interpreter_energy(
                    energy_given_to_interpreter.saturating_sub(remaining_interpreter_energy),
                );
                remaining_energy.tick_energy(energy_used_in_interpreter)?;

                // Charge one energy per stored state byte.
                let energy_for_state_storage = Energy::from(collector.collect());
                remaining_energy.tick_energy(energy_for_state_storage)?;

                // Charge the constant cost for initializing a contract.
                remaining_energy
                    .tick_energy(constants::INITIALIZE_CONTRACT_INSTANCE_CREATE_COST)?;

                let contract = Contract {
                    module_reference: payload.mod_ref,
                    contract_name:    payload.init_name,
                    state:            persisted_state,
                    owner:            sender,
                    self_balance:     payload.amount,
                };

                // Save the contract.
                self.contracts.insert(contract_address, contract);

                // Subtract the amount from the invoker.
                self.account_mut(sender)
                    .expect("Account known to exist")
                    .balance
                    .total -= payload.amount;

                let energy_used = energy_reserved - *remaining_energy;
                let transaction_fee = self.parameters.calculate_energy_cost(energy_used);

                Ok(ContractInitSuccess {
                    contract_address,
                    events: contract_events_from_logs(logs),
                    energy_used,
                    transaction_fee,
                })
            }
            Ok(v1::InitResult::Reject {
                reason,
                return_value,
                remaining_energy: remaining_interpreter_energy,
            }) => {
                let energy_used_in_interpreter = from_interpreter_energy(
                    energy_given_to_interpreter.saturating_sub(remaining_interpreter_energy),
                );
                remaining_energy.tick_energy(energy_used_in_interpreter)?;
                Err(ContractInitErrorKind::ExecutionError {
                    error: InitExecutionError::Reject {
                        reason,
                        return_value,
                    },
                })
            }
            Ok(v1::InitResult::Trap {
                error,
                remaining_energy: remaining_interpreter_energy,
            }) => {
                let energy_used_in_interpreter = from_interpreter_energy(
                    energy_given_to_interpreter.saturating_sub(remaining_interpreter_energy),
                );
                remaining_energy.tick_energy(energy_used_in_interpreter)?;
                Err(ContractInitErrorKind::ExecutionError {
                    error: InitExecutionError::Trap {
                        error: error.into(),
                    },
                })
            }
            Ok(v1::InitResult::OutOfEnergy) => {
                *remaining_energy = Energy::from(0);
                Err(ContractInitErrorKind::ExecutionError {
                    error: InitExecutionError::OutOfEnergy,
                })
            }
            Err(error) => Err(ContractInitErrorKind::ExecutionError {
                error: InitExecutionError::Trap {
                    error: error.into(),
                },
            }),
        }
    }

    /// Helper method that handles contract invocation.
    ///
    /// *Preconditions:*
    ///  - `invoker` exists.
    ///  - `sender` exists.
    ///  - `invoker`s balance is >= `amount`.
    fn contract_invocation_worker(
        &self,
        invoker: AccountAddress,
        sender: Address,
        energy_reserved: Energy,
        amount_reserved_for_energy: Amount,
        payload: UpdateContractPayload,
        remaining_energy: &mut Energy,
    ) -> Result<
        (
            InvokeEntrypointResponse,
            ChangeSet,
            Vec<ContractTraceElement>,
        ),
        ContractInvokeError,
    > {
        // Check if the contract to invoke exists.
        if !self.contract_exists(payload.address) {
            return Err(self.from_invocation_error_kind(
                ContractDoesNotExist {
                    address: payload.address,
                }
                .into(),
                energy_reserved,
                *remaining_energy,
            ));
        }

        // Ensure that the parameter has a valid size.
        if payload.message.as_ref().len() > contracts_common::constants::MAX_PARAMETER_LEN {
            return Err(self.from_invocation_error_kind(
                ContractInvokeErrorKind::ParameterTooLarge,
                energy_reserved,
                *remaining_energy,
            ));
        }
        let mut contract_invocation = EntrypointInvocationHandler {
            changeset: ChangeSet::new(),
            remaining_energy,
            chain: self,
            reserved_amount: amount_reserved_for_energy,
            invoker,
        };

        let mut trace_elements = Vec::new();
        match contract_invocation.invoke_entrypoint(invoker, sender, payload, &mut trace_elements) {
            Ok(result) => Ok((result, contract_invocation.changeset, trace_elements)),
            Err(err) => {
                Err(self.from_invocation_error_kind(err.into(), energy_reserved, *remaining_energy))
            }
        }
    }

    fn contract_invocation_process_response(
        &self,
        result: InvokeEntrypointResponse,
        trace_elements: Vec<ContractTraceElement>,
        energy_reserved: Energy,
        remaining_energy: Energy,
        state_changed: bool,
    ) -> Result<ContractInvokeSuccess, ContractInvokeError> {
        match result.invoke_response {
            v1::InvokeResponse::Success { new_balance, data } => {
                let energy_used = energy_reserved - remaining_energy;
                let transaction_fee = self.parameters.calculate_energy_cost(energy_used);
                Ok(ContractInvokeSuccess {
                    trace_elements,
                    energy_used,
                    transaction_fee,
                    return_value: data.unwrap_or_default(),
                    state_changed,
                    new_balance,
                    events: contract_events_from_logs(result.logs),
                })
            }
            v1::InvokeResponse::Failure { kind } => Err(self.from_invocation_error_kind(
                ContractInvokeErrorKind::ExecutionError { failure_kind: kind },
                energy_reserved,
                remaining_energy,
            )),
        }
    }

    /// Update a contract by calling one of its entrypoints.
    ///
    /// If successful, all changes will be saved.
    ///
    /// **Parameters:**
    ///  - `invoker`: the account paying for the transaction.
    ///  - `sender`: the sender of the transaction, can also be a contract.
    ///    TODO: This does not make sense. Senders cannot be contracts.
    ///  - `contract_address`: the contract to update.
    ///  - `entrypoint`: the entrypoint to call.
    ///  - `parameter`: the contract parameter.
    ///  - `amount`: the amount sent to the contract.
    ///  - `energy_reserved`: the maximum energy that can be used in the update.
    pub fn contract_update(
        &mut self,
        signer: Signer,
        invoker: AccountAddress,
        sender: Address, // TODO: Why does this exist? contra
        energy_reserved: Energy,
        payload: UpdateContractPayload,
    ) -> Result<ContractInvokeSuccess, ContractInvokeError> {
        // Ensure the sender exists.
        if !self.address_exists(sender) {
            // TODO: Should we charge the header cost if the invoker exists but the sender
            // doesn't?
            // No, this situation should not happen.
            return Err(ContractInvokeError {
                energy_used:     Energy::from(0),
                transaction_fee: Amount::zero(),
                kind:            ContractInvokeErrorKind::SenderDoesNotExist(sender),
            });
        }

        // Compute the base cost for checking the transaction header.
        let check_header_cost = {
            // 1 byte for the tag.
            let transaction_size =
                transactions::construct::TRANSACTION_HEADER_SIZE + 1 + payload.size() as u64;
            transactions::cost::base_cost(transaction_size, signer.num_keys)
        };

        // Charge the header cost.
        let mut remaining_energy =
            energy_reserved
                .checked_sub(check_header_cost)
                .ok_or(ContractInvokeError {
                    energy_used:     Energy::from(0),
                    transaction_fee: Amount::zero(),
                    kind:            ContractInvokeErrorKind::OutOfEnergy,
                })?;

        let invoker_amount_reserved_for_nrg =
            self.parameters.calculate_energy_cost(energy_reserved);

        // Ensure the invoker exists.
        let Ok(account_info) = self.account(invoker) else {
            return Err(ContractInvokeError {
                energy_used:     Energy::from(0),
                transaction_fee: Amount::zero(),
                kind:            ContractInvokeErrorKind::InvokerDoesNotExist(
                    AccountDoesNotExist { address: invoker },
                ),
            });
        };

        // Ensure the account has sufficient funds to pay for the energy and amount.
        if account_info.balance.available() < invoker_amount_reserved_for_nrg + payload.amount {
            let energy_used = energy_reserved - remaining_energy;
            return Err(ContractInvokeError {
                energy_used,
                transaction_fee: self.parameters.calculate_energy_cost(energy_used),
                kind: ContractInvokeErrorKind::InsufficientFunds,
            });
        }

        // Charge account for the reserved energy up front. This is to ensure that
        // contract queries for the invoker balance are correct.
        // The `amount` is handled in contract_invocation_worker.
        let contract_address = payload.address;
        let res = self.contract_invocation_worker(
            invoker,
            sender,
            energy_reserved,
            invoker_amount_reserved_for_nrg,
            payload,
            &mut remaining_energy,
        );
        let res = match res {
            Ok((result, changeset, trace_elements)) => {
                // Charge energy for contract storage. Or return an error if out
                // of energy.
                let state_changed = if result.is_success() {
                    let res = changeset.persist(
                        &mut remaining_energy,
                        contract_address,
                        &mut self.accounts,
                        &mut self.contracts,
                    );
                    res.map_err(|_| self.invocation_out_of_energy_error(energy_reserved))?
                } else {
                    // An error occured, so state hasn't changed.
                    false
                };
                self.contract_invocation_process_response(
                    result,
                    trace_elements,
                    energy_reserved,
                    remaining_energy,
                    state_changed,
                )
            }
            Err(e) => Err(e),
        };

        let transaction_fee = match &res {
            Ok(s) => s.transaction_fee,
            Err(e) => e.transaction_fee,
        };
        // Change for execution.
        self.account_mut(invoker)
            .expect("existence already checked")
            .balance
            .total -= transaction_fee;
        res
    }

    /// Invoke a contract by calling an entrypoint.
    ///
    /// Similar to [`Chain::contract_update`](Self::contract_update) except that
    /// all changes are discarded afterwards. Typically used for "view"
    /// functions.
    ///
    /// **Parameters:**
    ///  - `invoker`: the account paying for the transaction.
    ///  - `sender`: the sender of the transaction, can also be a contract.
    ///  - `contract_address`: the contract to update.
    ///  - `entrypoint`: the entrypoint to call.
    ///  - `parameter`: the contract parameter.
    ///  - `amount`: the amount sent to the contract.
    ///  - `energy_reserved`: the maximum energy that can be used in the update.
    pub fn contract_invoke(
        &self,
        invoker: AccountAddress,
        sender: Address,
        energy_reserved: Energy,
        payload: UpdateContractPayload,
    ) -> Result<ContractInvokeSuccess, ContractInvokeError> {
        // Ensure the sender exists.
        if !self.address_exists(sender) {
            return Err(ContractInvokeError {
                energy_used:     Energy::from(0),
                transaction_fee: Amount::zero(),
                kind:            ContractInvokeErrorKind::SenderDoesNotExist(sender),
            });
        }

        let Some(account_info) = self.accounts.get(&invoker.into()) else {
            return Err(ContractInvokeError {
                energy_used:     Energy::from(0),
                transaction_fee: Amount::zero(),
                kind:            ContractInvokeErrorKind::InvokerDoesNotExist(
                    AccountDoesNotExist { address: invoker },
                ),
            });
        };

        let invoker_amount_reserved_for_nrg =
            self.parameters.calculate_energy_cost(energy_reserved);

        if account_info.balance.available() < invoker_amount_reserved_for_nrg + payload.amount {
            let energy_used = Energy::from(0);
            return Err(ContractInvokeError {
                energy_used,
                transaction_fee: self.parameters.calculate_energy_cost(energy_used),
                kind: ContractInvokeErrorKind::InsufficientFunds,
            });
        }

        let mut remaining_energy = energy_reserved;

        let contract_address = payload.address;

        let res = self.contract_invocation_worker(
            invoker,
            sender,
            energy_reserved,
            invoker_amount_reserved_for_nrg,
            payload,
            &mut remaining_energy,
        );
        let res = match res {
            Ok((result, changeset, trace_elements)) => {
                // Charge energy for contract storage. Or return an error if out
                // of energy.
                let state_changed = if result.is_success() {
                    changeset
                        .collect_energy_for_state(&mut remaining_energy, contract_address)
                        .map_err(|_| self.invocation_out_of_energy_error(energy_reserved))?
                } else {
                    // An error occured, so state hasn't changed.
                    false
                };
                self.contract_invocation_process_response(
                    result,
                    trace_elements,
                    energy_reserved,
                    remaining_energy,
                    state_changed,
                )
            }
            Err(e) => Err(e),
        };

        res
    }

    /// Create an account.
    ///
    /// If an account with a matching address already exists this method will
    /// replace it and return it.
    ///
    /// Note that if the first 29-bytes of an account are identical, then
    /// they are *considered aliases* on each other in all methods.
    /// See the example below:
    ///
    /// ```
    /// # use concordium_smart_contract_testing::*;
    /// let mut chain = Chain::new();
    /// let acc = AccountAddress([
    ///     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ///     0, 0,
    /// ]);
    /// let acc_alias = AccountAddress([
    ///     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ///     2, 3, // Only last three bytes differ.
    /// ]);
    ///
    /// chain.create_account(Account::new(acc, Amount::from_ccd(123)));
    /// assert_eq!(
    ///     chain.account_balance_available(acc_alias), // Using the alias for lookup.
    ///     Some(Amount::from_ccd(123))
    /// );
    /// ```
    pub fn create_account(&mut self, account: Account) -> Option<Account> {
        self.accounts.insert(account.address.into(), account)
    }

    /// Create a contract address by giving it the next available index.
    fn create_contract_address(&mut self) -> ContractAddress {
        let index = self.next_contract_index;
        let subindex = 0;
        self.next_contract_index += 1;
        ContractAddress::new(index, subindex)
    }

    /// Returns the balance of an account if it exists.
    pub fn account_balance(&self, address: AccountAddress) -> Option<AccountBalance> {
        self.accounts.get(&address.into()).map(|ai| ai.balance)
    }

    /// Returns the available balance of an account if it exists.
    pub fn account_balance_available(&self, address: AccountAddress) -> Option<Amount> {
        self.accounts
            .get(&address.into())
            .map(|ai| ai.balance.available())
    }

    /// Returns the balance of an contract if it exists.
    pub fn contract_balance(&self, address: ContractAddress) -> Option<Amount> {
        self.contracts.get(&address).map(|ci| ci.self_balance)
    }

    /// Helper method for looking up part of the state of a smart contract,
    /// which is a key-value store.
    pub fn contract_state_lookup(&self, address: ContractAddress, key: &[u8]) -> Option<Vec<u8>> {
        let mut loader = v1::trie::Loader::new(&[][..]);
        self.contracts.get(&address)?.state.lookup(&mut loader, key)
    }

    /// Return a clone of the [`ContractModule`] (which has an `Arc` around the
    /// artifact so cloning is cheap).
    fn contract_module(
        &self,
        module_ref: ModuleReference,
    ) -> Result<ContractModule, ModuleDoesNotExist> {
        let module = self.modules.get(&module_ref).ok_or(ModuleDoesNotExist {
            module_reference: module_ref,
        })?;
        Ok(module.clone())
    }

    /// Returns an immutable reference to an [`Account`].
    pub fn account(&self, address: AccountAddress) -> Result<&Account, AccountDoesNotExist> {
        self.accounts
            .get(&address.into())
            .ok_or(AccountDoesNotExist { address })
    }

    /// Returns a mutable reference to [`Account`].
    fn account_mut(
        &mut self,
        address: AccountAddress,
    ) -> Result<&mut Account, AccountDoesNotExist> {
        self.accounts
            .get_mut(&address.into())
            .ok_or(AccountDoesNotExist { address })
    }

    /// Check whether an [`Account`] exists.
    pub fn account_exists(&self, address: AccountAddress) -> bool {
        self.accounts.contains_key(&address.into())
    }

    /// Check whether a [`Contract`] exists.
    pub fn contract_exists(&self, address: ContractAddress) -> bool {
        self.contracts.contains_key(&address)
    }

    /// Check whether an object with the [`Address`] exists.
    ///
    /// That is, if it is an account address, whether the account exists,
    /// and if it is a contract address, whether the contract exists.
    fn address_exists(&self, address: Address) -> bool {
        match address {
            Address::Account(acc) => self.account_exists(acc),
            Address::Contract(contr) => self.contract_exists(contr),
        }
    }

    /// Convert a [`ContractInvokeErrorKind`] to a
    /// [`ContractInvokeError`] by calculating the `energy_used` and
    /// `transaction_fee`.
    ///
    /// If the `kind` is an out of energy, then `0` is used instead of the
    /// `remaining_energy` parameter, as it will likely not be `0` due to short
    /// circuiting during execution.
    fn from_invocation_error_kind(
        &self,
        kind: ContractInvokeErrorKind,
        energy_reserved: Energy,
        remaining_energy: Energy,
    ) -> ContractInvokeError {
        let remaining_energy = if matches!(kind, ContractInvokeErrorKind::OutOfEnergy) {
            0.into()
        } else {
            remaining_energy
        };
        let energy_used = energy_reserved - remaining_energy;
        let transaction_fee = self.parameters.calculate_energy_cost(energy_used);
        ContractInvokeError {
            energy_used,
            transaction_fee,
            kind,
        }
    }

    /// Construct a [`ContractInvokeErrorKind`] of the `OutOfEnergy` kind with
    /// the energy and transaction fee fields based on the `energy_reserved`
    /// parameter.
    fn invocation_out_of_energy_error(&self, energy_reserved: Energy) -> ContractInvokeError {
        self.from_invocation_error_kind(
            ContractInvokeErrorKind::OutOfEnergy,
            energy_reserved,
            Energy::from(0),
        )
    }

    /// Convert a [`ContractInitErrorKind`] to a
    /// [`ContractInitError`] by calculating the `energy_used` and
    /// `transaction_fee`.
    fn from_init_error_kind(
        &self,
        kind: ContractInitErrorKind,
        energy_reserved: Energy,
        remaining_energy: Energy,
    ) -> ContractInitError {
        let energy_used = energy_reserved - remaining_energy;
        let transaction_fee = self.parameters.calculate_energy_cost(energy_used);
        ContractInitError {
            energy_used,
            transaction_fee,
            kind,
        }
    }

    /// Try to set the exchange rates on the chain.
    ///
    /// Will fail if they result in the cost of one energy being larger than
    /// `u64::MAX / MAX_ALLOWED_INVOKE_ENERGY`.
    pub fn set_exchange_rate(
        &mut self,
        micro_ccd_per_euro: ExchangeRate,
        euro_per_energy: ExchangeRate,
    ) -> Result<(), ExchangeRateError> {
        // Ensure the exchange rates are within a valid range.
        check_exchange_rates(euro_per_energy, micro_ccd_per_euro)?;
        self.parameters.micro_ccd_per_euro = micro_ccd_per_euro;
        self.parameters.euro_per_energy = euro_per_energy;
        Ok(())
    }

    /// Return the current microCCD per euro exchange rate.
    pub fn micro_ccd_per_euro(&self) -> ExchangeRate { self.parameters.micro_ccd_per_euro }

    /// Return the current euro per energy exchange rate.
    pub fn euro_per_energy(&self) -> ExchangeRate { self.parameters.euro_per_energy }
}

impl Account {
    /// Create new [`Account`](Self) with the provided account policy.
    pub fn new_with_policy(
        address: AccountAddress,
        balance: AccountBalance,
        policy: OwnedPolicy,
    ) -> Self {
        Self {
            balance,
            policy,
            address,
        }
    }

    /// Create a new [`Account`](Self) with the provided balance and a default
    /// account policy.
    ///
    /// See [`new`][Self::new] for what the default policy is.
    pub fn new_with_balance(address: AccountAddress, balance: AccountBalance) -> Self {
        Self::new_with_policy(address, balance, Self::empty_policy())
    }

    /// Create new [`Account`](Self) with the provided total balance.
    ///
    /// The `policy` will have:
    ///   - `identity_provider`: 0,
    ///   - `created_at`: unix epoch,
    ///   - `valid_to`: unix epoch + `u64::MAX` milliseconds,
    ///   - `items`: none,
    ///
    /// The [`AccountBalance`] will be created with the provided
    /// `total_balance`.
    pub fn new(address: AccountAddress, total_balance: Amount) -> Self {
        Self::new_with_policy(
            address,
            AccountBalance {
                total:  total_balance,
                staked: Amount::zero(),
                locked: Amount::zero(),
            },
            Self::empty_policy(),
        )
    }

    /// Helper for creating an empty policy.
    ///
    /// It has identity provider `0`, no items, and is valid from unix epoch
    /// until unix epoch + u64::MAX milliseconds.
    fn empty_policy() -> OwnedPolicy {
        OwnedPolicy {
            identity_provider: 0,
            created_at:        Timestamp::from_timestamp_millis(0),
            valid_to:          Timestamp::from_timestamp_millis(u64::MAX),
            items:             Vec::new(),
        }
    }
}

// TODO: This should go to concordium-base.
impl From<AccountAddressEq> for AccountAddress {
    fn from(aae: AccountAddressEq) -> Self { aae.0 }
}

impl From<AccountAddress> for AccountAddressEq {
    fn from(address: AccountAddress) -> Self { Self(address) }
}

impl PartialEq for AccountAddressEq {
    fn eq(&self, other: &Self) -> bool {
        let bytes_1: &[u8; 32] = self.0.as_ref();
        let bytes_2: &[u8; 32] = other.0.as_ref();
        bytes_1[0..29] == bytes_2[0..29]
    }
}

impl PartialOrd for AccountAddressEq {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> { Some(self.cmp(other)) }
}

impl Ord for AccountAddressEq {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        let bytes_1: &[u8; 32] = self.0.as_ref();
        let bytes_2: &[u8; 32] = other.0.as_ref();
        bytes_1[0..29].cmp(&bytes_2[0..29])
    }
}

impl AsRef<AccountAddressEq> for AccountAddress {
    fn as_ref(&self) -> &AccountAddressEq { unsafe { std::mem::transmute(self) } }
}

impl Signer {
    /// Create a signer which always signs with one key.
    pub fn with_one_key() -> Self { Self { num_keys: 1 } }

    /// Create a signer with a non-zero number of keys.
    pub fn with_keys(num_keys: u32) -> Result<Self, ZeroKeysError> {
        if num_keys == 0 {
            return Err(ZeroKeysError);
        }
        Ok(Self { num_keys })
    }
}

impl ContractInvokeSuccess {
    /// Get an iterator of all transfers that were made from contracts to
    /// accounts.
    pub fn transfers(&self) -> impl Iterator<Item = Transfer> + '_ {
        self.trace_elements.iter().filter_map(|e| {
            if let ContractTraceElement::Transferred { from, amount, to } = e {
                Some(Transfer {
                    from:   *from,
                    amount: *amount,
                    to:     *to,
                })
            } else {
                None
            }
        })
    }

    /// Get the trace elements grouped by which contract they originated from.
    pub fn trace_elements_per_contract(
        &self,
    ) -> BTreeMap<ContractAddress, Vec<ContractTraceElement>> {
        let mut map: BTreeMap<ContractAddress, Vec<ContractTraceElement>> = BTreeMap::new();
        for event in self.trace_elements.iter() {
            map.entry(Self::extract_contract_address(&event))
                .and_modify(|v| v.push(event.clone()))
                .or_insert(vec![event.clone()]);
        }
        map
    }

    /// Get the contract address that this event relates to.
    /// This means the `address` field for all variant except `Transferred`,
    /// where it returns the `from`.
    fn extract_contract_address(element: &ContractTraceElement) -> ContractAddress {
        match element {
            ContractTraceElement::Interrupted { address, .. } => *address,
            ContractTraceElement::Resumed { address, .. } => *address,
            ContractTraceElement::Upgraded { address, .. } => *address,
            ContractTraceElement::Updated {
                data: InstanceUpdatedEvent { address, .. },
            } => *address,
            ContractTraceElement::Transferred { from, .. } => *from,
        }
    }
}

impl From<OutOfEnergy> for ContractInitErrorKind {
    fn from(_: OutOfEnergy) -> Self { Self::OutOfEnergy }
}

impl From<TestConfigurationError> for ContractInvokeErrorKind {
    fn from(err: TestConfigurationError) -> Self {
        match err {
            TestConfigurationError::OutOfEnergy => Self::OutOfEnergy,
            TestConfigurationError::BalanceOverflow => Self::BalanceOverflow,
        }
    }
}

/// Convert [`Energy`] to [`InterpreterEnergy`] by multiplying by `1000`.
pub(crate) fn to_interpreter_energy(energy: Energy) -> InterpreterEnergy {
    InterpreterEnergy::from(energy.energy * 1000)
}

/// Convert [`InterpreterEnergy`] to [`Energy`] by dividing by `1000`.
pub(crate) fn from_interpreter_energy(interpreter_energy: InterpreterEnergy) -> Energy {
    Energy::from(interpreter_energy.energy / 1000)
}

/// Calculate the energy for looking up a [`ContractModule`].
pub(crate) fn lookup_module_cost(module: &ContractModule) -> Energy {
    // The ratio is from Concordium/Cost.hs::lookupModule
    Energy::from(module.size / 50)
}

/// Calculate the microCCD(mCCD) cost of energy(NRG) using the two exchange
/// rates provided.
///
/// To find the mCCD/NRG exchange rate:
/// ```markdown
///  euro     mCCD   euro * mCCD   mCCD
///  ----  *  ---- = ----------- = ----
///  NRG      euro   NRG * euro    NRG
/// ```
///
/// To convert the `energy` parameter to mCCD:
/// ```markdown
/// 
///        mCCD   NRG * mCCD
///  NRG * ---- = ---------- = mCCD
///        NRG       NRG
/// ```
pub fn energy_to_amount(
    energy: Energy,
    euro_per_energy: ExchangeRate,
    micro_ccd_per_euro: ExchangeRate,
) -> Amount {
    let micro_ccd_per_energy_numerator: BigUint =
        BigUint::from(euro_per_energy.numerator()) * micro_ccd_per_euro.numerator();
    let micro_ccd_per_energy_denominator: BigUint =
        BigUint::from(euro_per_energy.denominator()) * micro_ccd_per_euro.denominator();
    let cost: BigUint =
        (micro_ccd_per_energy_numerator * energy.energy) / micro_ccd_per_energy_denominator;
    let cost: u64 = u64::try_from(cost).expect(
        "Should never overflow since reasonable exchange rates are ensured when constructing the \
         [`Chain`].",
    );
    Amount::from_micro_ccd(cost)
}

/// Helper function that checks the validity of the exchange rates.
///
/// More specifically, it checks that the cost of one energy is <= `u64::MAX /
/// [`MAX_ALLOWED_INVOKE_ENERGY`]`, which ensures that overflows won't occur.
fn check_exchange_rates(
    euro_per_energy: ExchangeRate,
    micro_ccd_per_euro: ExchangeRate,
) -> Result<(), ExchangeRateError> {
    let micro_ccd_per_energy_numerator: BigUint =
        BigUint::from(euro_per_energy.numerator()) * micro_ccd_per_euro.numerator();
    let micro_ccd_per_energy_denominator: BigUint =
        BigUint::from(euro_per_energy.denominator()) * micro_ccd_per_euro.denominator();
    let max_allowed_micro_ccd_to_energy = u64::MAX / MAX_ALLOWED_INVOKE_ENERGY.energy;
    let micro_ccd_per_energy =
        u64::try_from(micro_ccd_per_energy_numerator / micro_ccd_per_energy_denominator)
            .map_err(|_| ExchangeRateError)?;
    if micro_ccd_per_energy > max_allowed_micro_ccd_to_energy {
        return Err(ExchangeRateError);
    }
    Ok(())
}

/// A helper function for converting `[v0::Logs]` into [`Vec<ContractEvent>`].
pub(crate) fn contract_events_from_logs(logs: v0::Logs) -> Vec<ContractEvent> {
    logs.logs.into_iter().map(ContractEvent::from).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A few checks that test whether the function behavior matches its doc
    /// comments.
    #[test]
    fn check_exchange_rates_works() {
        let max_allowed_micro_ccd_per_energy = u64::MAX / MAX_ALLOWED_INVOKE_ENERGY.energy;
        check_exchange_rates(
            ExchangeRate::new_unchecked(max_allowed_micro_ccd_per_energy + 1, 1),
            ExchangeRate::new_unchecked(1, 1),
        )
        .expect_err("should fail");

        check_exchange_rates(
            ExchangeRate::new_unchecked(max_allowed_micro_ccd_per_energy / 2 + 1, 1),
            ExchangeRate::new_unchecked(2, 1),
        )
        .expect_err("should fail");

        check_exchange_rates(
            ExchangeRate::new_unchecked(max_allowed_micro_ccd_per_energy, 1),
            ExchangeRate::new_unchecked(1, 1),
        )
        .expect("should succeed");

        check_exchange_rates(
            ExchangeRate::new_unchecked(50000, 1),
            ExchangeRate::new_unchecked(1, 50000),
        )
        .expect("should succeed");
    }

    /// Test that account aliases are seen as one account.
    #[test]
    fn test_account_aliases() {
        let mut chain = Chain::new();
        let acc = AccountAddress([
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0,
        ]);
        let acc_alias = AccountAddress([
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            1, 2, 3, // Last three bytes can differ for aliases.
        ]);
        let acc_other = AccountAddress([
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
            2, 3, 4, // This differs on last four bytes, so it is a different account.
        ]);
        let acc_eq = AccountAddressEq(acc);
        let acc_alias_eq = AccountAddressEq(acc_alias);
        let acc_other_eq = AccountAddressEq(acc_other);

        let expected_amount = Amount::from_ccd(10);
        let expected_amount_other = Amount::from_ccd(123);

        chain.create_account(Account::new(acc, expected_amount));
        chain.create_account(Account::new(acc_other, expected_amount_other));

        assert_eq!(acc_eq, acc_alias_eq);
        assert_ne!(acc_eq, acc_other_eq);

        assert_eq!(acc_eq.cmp(&acc_alias_eq), std::cmp::Ordering::Equal);
        assert_eq!(acc_eq.cmp(&acc_other_eq), std::cmp::Ordering::Less);

        assert_eq!(
            chain.account_balance_available(acc_alias),
            Some(expected_amount)
        );
        assert_eq!(
            chain.account_balance_available(acc_other),
            Some(expected_amount_other)
        );
    }
}
