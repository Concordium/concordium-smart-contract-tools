import { createContext } from 'react';
import {
    AccountTransactionType,
    CcdAmount,
    DeployModulePayload,
    InitContractPayload,
    ModuleReference,
    toBuffer,
} from '@concordium/web-sdk';
import { WalletConnection } from '@concordium/react-components';
import { moduleSchemaFromBase64 } from '@concordium/wallet-connectors';

export async function deploy(connection: WalletConnection, account: string, base64Module: string) {
    if (base64Module === '') {
        throw new Error(`Upload a smart contract module first`);
    }

    return connection.signAndSendTransaction(account, AccountTransactionType.DeployModule, {
        source: toBuffer(base64Module, 'base64'),
    } as DeployModulePayload);
}

export async function initialize(
    connection: WalletConnection,
    account: string,
    moduleReferenceAlreadyDeployed: boolean,
    moduleReference: string,
    inputParameter: string,
    contractName: string,
    hasInputParameter: boolean,
    useModuleFromStep1: boolean,
    moduleSchema: string,
    dropDown: string,
    maxContractExecutionEnergy: string,
    amount?: string
) {
    if (moduleReferenceAlreadyDeployed === false) {
        throw new Error(`Module reference does not exist on chain. First, deploy your module in step 1.`);
    }

    if (moduleReference === '') {
        throw new Error(`Set module reference`);
    }

    if (contractName === '') {
        throw new Error(`Set smart contract name`);
    }

    if (maxContractExecutionEnergy === '') {
        throw new Error(`Set max contract execution energy`);
    }

    if (hasInputParameter) {
        if (!useModuleFromStep1 && moduleSchema === '') {
            throw new Error(`Set schema`);
        } else if (useModuleFromStep1 && moduleSchema === '') {
            throw new Error(`No embedded module schema found in module`);
        }
    }

    let schema;

    if (hasInputParameter) {
        switch (dropDown) {
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
                throw new Error(`Dropdown option does not exist`);
        }
    }

    return connection.signAndSendTransaction(
        account,
        AccountTransactionType.InitContract,
        {
            amount: new CcdAmount(BigInt(amount ? Number(amount) : 0)),
            moduleRef: new ModuleReference(moduleReference),
            initName: contractName,
            param: toBuffer(''),
            maxContractExecutionEnergy: BigInt(maxContractExecutionEnergy),
        } as InitContractPayload,
        schema
    );
}

/**
 * Global application state.
 */
export type State = {
    isConnected: boolean;
    account: string | undefined;
};

export const state = createContext<State>({ isConnected: false, account: undefined });
