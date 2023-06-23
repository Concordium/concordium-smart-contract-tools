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
    moduleReference: string,
    inputParameter: string,
    initName: string,
    hasInputParameter: boolean,
    contractSchema: string,
    dropDown: string,
    amount?: string
) {
    if (moduleReference === '') {
        throw new Error(`Set moduleReference`);
    }

    if (initName === '') {
        throw new Error(`Set smart contract name`);
    }

    if (hasInputParameter) {
        if (contractSchema === '') {
            throw new Error(`Set schema`);
        }
    }

    let schema;

    if (contractSchema !== '') {
        switch (dropDown) {
            case 'number':
                schema = {
                    parameters: Number(inputParameter),
                    schema: moduleSchemaFromBase64(contractSchema),
                };
                break;
            case 'string':
                schema = {
                    parameters: inputParameter,
                    schema: moduleSchemaFromBase64(contractSchema),
                };
                break;
            case 'object':
                schema = {
                    parameters: JSON.parse(inputParameter),
                    schema: moduleSchemaFromBase64(contractSchema),
                };
                break;
            case 'array':
                schema = {
                    parameters: JSON.parse(inputParameter),
                    schema: moduleSchemaFromBase64(contractSchema),
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
            initName,
            param: toBuffer(''),
            maxContractExecutionEnergy: 30000n,
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
