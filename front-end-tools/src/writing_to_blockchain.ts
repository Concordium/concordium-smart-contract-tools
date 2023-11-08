import {
    AccountTransactionType,
    CcdAmount,
    DeployModulePayload,
    InitContractPayload,
    ModuleReference,
    UpdateContractPayload,
    toBuffer,
} from '@concordium/web-sdk';
import { WalletConnection } from '@concordium/react-components';
import { moduleSchemaFromBase64 } from '@concordium/wallet-connectors';
import { CONTRACT_SUB_INDEX } from './constants';

/** This function signs and sends a `DeployModule` transaction.
 */
export async function deploy(connection: WalletConnection, account: string, base64Module: string | undefined) {
    if (base64Module === undefined) {
        throw new Error(`Upload a smart contract module first`);
    }

    return connection.signAndSendTransaction(account, AccountTransactionType.DeployModule, {
        source: toBuffer(base64Module, 'base64'),
    } as DeployModulePayload);
}

/** This function signs and sends an `Update` transaction.
 * If the transaction should include an input parameter, `hasInputParameter` needs to be true
 * and the `inputParameter`, its `inputParameterType`, and the contract `moduleSchema` have to be provided.
 */
export async function update(
    connection: WalletConnection,
    account: string,
    inputParameter: string | undefined,
    contractName: string,
    entryPoint: string | undefined,
    hasInputParameter: boolean,
    deriveContractInfo: boolean,
    moduleSchema: string | undefined,
    inputParameterType: string | undefined,
    maxContractExecutionEnergy: bigint,
    contractIndex: bigint,
    amount: bigint
) {
    if (entryPoint === undefined) {
        throw new Error(`Set entry point name`);
    }

    let schema;

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
                    schema = {
                        parameters: Number(inputParameter),
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                case 'string':
                    schema = {
                        parameters: inputParameter,
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                case 'object':
                    schema = {
                        parameters: JSON.parse(inputParameter),
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                case 'array':
                    schema = {
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
        account,
        AccountTransactionType.Update,
        {
            amount: new CcdAmount(amount),
            address: { index: contractIndex, subindex: CONTRACT_SUB_INDEX },
            receiveName: `${contractName}.${entryPoint}`,
            maxContractExecutionEnergy,
        } as UpdateContractPayload,
        schema
    );
}

/** This function signs and sends an `InitContract` transaction.
 * If the transaction should include an input parameter,
 * `hasInputParameter` needs to be true and the `inputParameter`,
 * its `inputParameterType`, and the contract `moduleSchema` have to be provided.
 */
export async function initialize(
    connection: WalletConnection,
    account: string,
    moduleReferenceAlreadyDeployed: boolean,
    moduleReference: string | undefined,
    inputParameter: string | undefined,
    contractName: string | undefined,
    hasInputParameter: boolean,
    useModuleFromStep1: boolean,
    moduleSchema: string | undefined,
    inputParamterType: string | undefined,
    maxContractExecutionEnergy: bigint,
    amount: bigint
) {
    if (moduleReferenceAlreadyDeployed === false) {
        throw new Error(`Module reference does not exist on chain. First, deploy your module in step 1.`);
    }

    if (moduleReference === undefined) {
        throw new Error(`Set module reference`);
    }

    if (contractName === undefined) {
        throw new Error(`Set smart contract name`);
    }

    let schema;

    if (hasInputParameter) {
        if (!useModuleFromStep1 && moduleSchema === undefined) {
            throw new Error(`Set schema`);
        } else if (useModuleFromStep1 && moduleSchema === undefined) {
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
                    schema = {
                        parameters: Number(inputParameter),
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                case 'string':
                    schema = {
                        parameters: inputParameter,
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                case 'object':
                    schema = {
                        parameters: JSON.parse(inputParameter),
                        schema: moduleSchemaFromBase64(moduleSchema),
                    };
                    break;
                case 'array':
                    schema = {
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
        account,
        AccountTransactionType.InitContract,
        {
            amount: new CcdAmount(amount),
            moduleRef: new ModuleReference(moduleReference),
            initName: contractName,
            param: toBuffer(''),
            maxContractExecutionEnergy,
        } as InitContractPayload,
        schema
    );
}
