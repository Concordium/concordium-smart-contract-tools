import {
    AccountAddress,
    AccountTransactionType,
    CcdAmount,
    ContractAddress,
    ContractName,
    DeployModulePayload,
    Energy,
    EntrypointName,
    InitContractPayload,
    ModuleReference,
    Parameter,
    ReceiveName,
    UpdateContractPayload,
    toBuffer,
} from '@concordium/web-sdk';
import { TypedSmartContractParameters, WalletConnection } from '@concordium/react-components';
import { moduleSchemaFromBase64 } from '@concordium/wallet-connectors';
import { CONTRACT_SUB_INDEX, DERIVE_FROM_CHAIN, DERIVE_FROM_STEP_1, DO_NOT_DERIVE } from './constants';

/**
 * This function signs and sends a `DeployModule` transaction. A promise is returned for the hash of the submitted transaction.
 * This type of transaction deploys a new Wasm module on chain.
 *
 * @param connection the wallet connection to submit the transaction to.
 * @param account the account whose keys are used to sign the transaction.
 * @param base64Module the Wasm module in base64 format to be deployed.
 *
 * @returns A promise for the hash of the submitted transaction.
 * @throws If the `base64Module` is undefined.
 * @throws If the request to the wallet fails.
 */
export async function deploy(
    connection: WalletConnection,
    account: AccountAddress.Type,
    base64Module: string | undefined
) {
    if (base64Module === undefined) {
        throw new Error(`Upload a smart contract module first`);
    }

    return connection.signAndSendTransaction(AccountAddress.toBase58(account), AccountTransactionType.DeployModule, {
        source: toBuffer(base64Module, 'base64'),
    } as DeployModulePayload);
}

/**
 * This function signs and sends an `Update` transaction. A promise is returned for the hash of the submitted transaction.
 * This type of transaction updates a new smart contract instance on chain.
 * If the `hasInputParameter` is true, the `inputParameter` and its `inputParameterType`, and the contract `moduleSchema` have to
 * be provided so that the input parameter can be serialized.
 *
 * @param connection the wallet connection to submit the transaction to.
 * @param account the account whose keys are used to sign the transaction.
 * @param contractName the contract name.
 * @param entryPoint the entrypoint name.
 * @param deriveContractInfoFromIndex a boolean signaling if values were derived from the contract index or manually inputted by the user.
 * @param hasInputParameter a boolean signaling if the init function has an input parameter.
 * @param inputParameter an optional input parameter.
 * @param inputParameterType  an optional input parameter type (`string`/`number`/`array`/`object`).
 * @param moduleSchema an optional module schema to serialize the input parameter.
 * @param maxContractExecutionEnergy the maximum amount of energy to be used while executing the transaction.
 * @param contractIndex the contract index (part of the smart contract address).
 * @param amount the amount of micro CCD to send.
 *
 * @returns A promise for the hash of the submitted transaction.
 * @throws If the `entryPoint` is undefined.
 * @throws If the `hasInputParameter` is true but the input parameter cannot be serialized.
 * @throws If the request to the wallet fails.
 */
export async function update(
    connection: WalletConnection,
    account: AccountAddress.Type,
    contractName: ContractName.Type,
    entryPoint: EntrypointName.Type | undefined,
    deriveContractInfoFromIndex: boolean,
    hasInputParameter: boolean,
    inputParameter: string | undefined,
    inputParameterType: string | undefined,
    moduleSchema: string | undefined,
    maxContractExecutionEnergy: Energy.Type,
    contractIndex: bigint,
    amount: CcdAmount.Type
) {
    if (entryPoint === undefined) {
        throw new Error(`Set entry point name`);
    }

    let params: TypedSmartContractParameters | undefined;

    if (hasInputParameter) {
        if (!deriveContractInfoFromIndex && moduleSchema === undefined) {
            throw new Error(`Set schema`);
        } else if (deriveContractInfoFromIndex && moduleSchema === undefined) {
            throw new Error(`No embedded module schema found in module`);
        }

        if (moduleSchema !== undefined) {
            if (inputParameterType === undefined) {
                throw new Error(`InputParameterType is undefined`);
            }

            if (inputParameter === undefined) {
                throw new Error(`Set input parameter`);
            }

            switch (inputParameterType) {
                case 'number':
                    params = {
                        parameters: Number(inputParameter),
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                case 'string':
                    params = {
                        parameters: inputParameter,
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                case 'object':
                    params = {
                        parameters: JSON.parse(inputParameter),
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                case 'array':
                    params = {
                        parameters: JSON.parse(inputParameter),
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                default:
                    throw new Error(`Input parameter type option does not exist`);
            }
        }
    }

    return connection.signAndSendTransaction(
        AccountAddress.toBase58(account),
        AccountTransactionType.Update,
        {
            amount,
            address: ContractAddress.create(contractIndex, CONTRACT_SUB_INDEX),
            receiveName: ReceiveName.create(contractName, entryPoint),
            maxContractExecutionEnergy,
        } as UpdateContractPayload,
        params
    );
}

/**
 * This function signs and sends an `InitContract` transaction. A promise is returned for the hash of the submitted transaction.
 * This type of transaction creates a new smart contract instance on chain.
 * If the `hasInputParameter` is true, the `inputParameter` and its `inputParameterType`, and the contract `moduleSchema` have to
 * be provided so that the input parameter can be serialized.
 *
 * @param connection the wallet connection to submit the transaction to.
 * @param account the account whose keys are used to sign the transaction.
 * @param moduleReferenceAlreadyDeployed a boolean signaling if the module is already deployed on chain.
 * @param moduleReference the module's reference to initialize the smart contract instance from, represented by the ModuleReference class.
 * @param contractName the contract name in case several contracts exist in the module.
 * @param hasInputParameter a boolean signaling if the init function has an input parameter.
 * @param inputParameter an optional input parameter.
 * @param inputParameterType  an optional input parameter type (`string`/`number`/`array`/`object`).
 * @param moduleSchema an optional module schema to serialize the input parameter.
 * @param deriveFromModuleReference a value signalling how the module reference (and associated values) were derived (`doNotDerive`/`deriveFromStep1`/`deriveFromChain`).
 * @param maxContractExecutionEnergy the maximum amount of energy to be used while executing the transaction.
 * @param amount the amount of micro CCD to send.
 *
 * @returns A promise for the hash of the submitted transaction.
 * @throws If the `moduleReferenceAlreadyDeployed` is false.
 * @throws If the `moduleReference` is undefined.
 * @throws If the `contractName` is undefined.
 * @throws If the `hasInputParameter` is true but the input parameter cannot be serialized.
 * @throws If the request to the wallet fails.
 */
export async function initialize(
    connection: WalletConnection,
    account: AccountAddress.Type,
    moduleReferenceAlreadyDeployed: boolean,
    moduleReference: ModuleReference.Type | undefined,
    contractName: ContractName.Type | undefined,
    hasInputParameter: boolean,
    inputParameter: string | undefined,
    inputParameterType: string | undefined,
    moduleSchema: string | undefined,
    deriveFromModuleReference: string | undefined,
    maxContractExecutionEnergy: Energy.Type,
    amount: CcdAmount.Type
) {
    if (moduleReferenceAlreadyDeployed === false) {
        throw new Error(
            `Module reference does not exist on chain. Enter a valid module reference or deploy your module in step 1 first.
           The step 2 box will not automatically derive values from the new module reference, 
           you might want to select "${DERIVE_FROM_STEP_1.label}/${DERIVE_FROM_CHAIN.label}" again to derive values from the new module reference`
        );
    }

    if (moduleReference === undefined) {
        throw new Error(`Set module reference`);
    }

    if (contractName === undefined) {
        throw new Error(`Set smart contract name`);
    }

    let params: TypedSmartContractParameters | undefined;

    if (hasInputParameter) {
        if (
            (deriveFromModuleReference === DO_NOT_DERIVE.value || deriveFromModuleReference === undefined) &&
            moduleSchema === undefined
        ) {
            throw new Error(`Set schema`);
        } else if (moduleSchema === undefined) {
            throw new Error(`No embedded module schema found in module`);
        }

        if (moduleSchema !== undefined) {
            if (inputParameterType === undefined) {
                throw new Error(`Set input parameter type`);
            }

            if (inputParameter === undefined) {
                throw new Error(`Set input parameter`);
            }

            switch (inputParameterType) {
                case 'number':
                    params = {
                        parameters: Number(inputParameter),
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                case 'string':
                    params = {
                        parameters: inputParameter,
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                case 'object':
                    params = {
                        parameters: JSON.parse(inputParameter),
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                case 'array':
                    params = {
                        parameters: JSON.parse(inputParameter),
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                default:
                    throw new Error(`Input parameter type does not exist`);
            }
        }
    }

    return connection.signAndSendTransaction(
        AccountAddress.toBase58(account),
        AccountTransactionType.InitContract,
        {
            amount,
            moduleRef: moduleReference,
            initName: contractName,
            param: Parameter.empty(),
            maxContractExecutionEnergy,
        } as InitContractPayload,
        params
    );
}
