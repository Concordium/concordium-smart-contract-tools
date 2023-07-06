import { createContext } from 'react';
import {
    AccountTransactionType,
    CcdAmount,
    DeployModulePayload,
    InitContractPayload,
    ModuleReference,
    toBuffer,
} from '@concordium/web-sdk';
import { WalletConnection, typeSchemaFromBase64 } from '@concordium/react-components';
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
    checkedBoxElemenChecked: boolean,
    contractSchema: string,
    inputParamterTypeSchema: string,
    dropDown: string,
    maxContractExecutionEnergy: string,
    amount?: string
) {
    if (moduleReference === '') {
        throw new Error(`Set module reference`);
    }

    if (initName === '') {
        throw new Error(`Set smart contract name`);
    }

    if (maxContractExecutionEnergy === '') {
        throw new Error(`Set max contract execution energy`);
    }

    if (hasInputParameter) {
        if (!checkedBoxElemenChecked && contractSchema === '') {
            throw new Error(`Set schema`);
        }

        if (checkedBoxElemenChecked && inputParamterTypeSchema === '') {
            throw new Error(`No embedded input parameter schema found in module`);
        }
    }

    let schema;

    if (hasInputParameter) {
        switch (dropDown) {
            case 'number':
                schema = {
                    parameters: Number(inputParameter),
                    schema: checkedBoxElemenChecked
                        ? typeSchemaFromBase64(inputParamterTypeSchema)
                        : moduleSchemaFromBase64(contractSchema),
                };
                break;
            case 'string':
                schema = {
                    parameters: inputParameter,
                    schema: checkedBoxElemenChecked
                        ? typeSchemaFromBase64(inputParamterTypeSchema)
                        : moduleSchemaFromBase64(contractSchema),
                };
                break;
            case 'object':
                schema = {
                    parameters: JSON.parse(inputParameter),
                    schema: checkedBoxElemenChecked
                        ? typeSchemaFromBase64(inputParamterTypeSchema)
                        : moduleSchemaFromBase64(contractSchema),
                };
                break;
            case 'array':
                schema = {
                    parameters: JSON.parse(inputParameter),
                    schema: checkedBoxElemenChecked
                        ? typeSchemaFromBase64(inputParamterTypeSchema)
                        : moduleSchemaFromBase64(contractSchema),
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
