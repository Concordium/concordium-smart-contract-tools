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
import { CONTRACT_SUB_INDEX } from './constants';

/** This function signs and sends a `DeployModule` transaction.
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

/** This function signs and sends an `Update` transaction.
 * If the transaction should include an input parameter, `hasInputParameter` needs to be true
 * and the `inputParameter`, its `inputParameterType`, and the contract `moduleSchema` have to be provided.
 */
export async function update(
    connection: WalletConnection,
    account: AccountAddress.Type,
    inputParameter: string | undefined,
    contractName: ContractName.Type,
    entryPoint: EntrypointName.Type | undefined,
    hasInputParameter: boolean,
    deriveContractInfo: boolean,
    moduleSchema: string | undefined,
    inputParameterType: string | undefined,
    maxContractExecutionEnergy: Energy.Type,
    contractIndex: bigint,
    amount: CcdAmount.Type
) {
    if (entryPoint === undefined) {
        throw new Error(`Set entry point name`);
    }

    let params: TypedSmartContractParameters | undefined;

    if (hasInputParameter) {
        if (!deriveContractInfo && moduleSchema === undefined) {
            throw new Error(`Set schema`);
        } else if (deriveContractInfo && moduleSchema === undefined) {
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
                    throw new Error(`Input paramter type option does not exist`);
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

/** This function signs and sends an `InitContract` transaction.
 * If the transaction should include an input parameter,
 * `hasInputParameter` needs to be true and the `inputParameter`,
 * its `inputParameterType`, and the contract `moduleSchema` have to be provided.
 */
export async function initialize(
    connection: WalletConnection,
    account: AccountAddress.Type,
    moduleReferenceAlreadyDeployed: boolean,
    moduleReference: ModuleReference.Type | undefined,
    inputParameter: string | undefined,
    contractName: ContractName.Type | undefined,
    hasInputParameter: boolean,
    deriveFromModuleRefernce: string | undefined,
    moduleSchema: string | undefined,
    inputParamterType: string | undefined,
    maxContractExecutionEnergy: Energy.Type,
    amount: CcdAmount.Type
) {
    if (moduleReferenceAlreadyDeployed === false) {
        throw new Error(
            `Module reference does not exist on chain. First, deploy your module in step 1 and change/refresh the module reference field in step 2 to remove this error.`
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
        if ((deriveFromModuleRefernce === "Don't derive" || undefined) && moduleSchema === undefined) {
            throw new Error(`Set schema`);
        } else if (moduleSchema === undefined) {
            throw new Error(`No embedded module schema found in module`);
        }

        if (moduleSchema !== undefined) {
            if (inputParamterType === undefined) {
                throw new Error(`Set input paramter type`);
            }

            if (inputParameter === undefined) {
                throw new Error(`Set input parameter`);
            }

            switch (inputParamterType) {
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
                    throw new Error(`Input paramter type does not exist`);
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
