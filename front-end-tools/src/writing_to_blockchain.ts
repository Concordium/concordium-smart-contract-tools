import { createContext } from 'react';
import {
    AccountTransactionType,
    CcdAmount,
    DeployModulePayload,
    InitContractPayload,
    ModuleReference,
    UpdateContractPayload,
    serializeTypeValue,
    toBuffer,
} from '@concordium/web-sdk';
import { WalletConnection } from '@concordium/react-components';
import { moduleSchemaFromBase64 } from '@concordium/wallet-connectors';
import { SmartContractParameters } from '@concordium/browser-wallet-api-helpers';
import {
    CONTRACT_SUB_INDEX,
    CREDENTIAL_REGISTRY_BASE_64_SCHEMA,
    STORAGE_CONTRACT_STORE_PARAMETER_SCHEMA,
} from './constants';

export async function deploy(connection: WalletConnection, account: string, base64Module: string) {
    if (base64Module === '') {
        throw new Error(`Upload a smart contract module first`);
    }

    return connection.signAndSendTransaction(account, AccountTransactionType.DeployModule, {
        source: toBuffer(base64Module, 'base64'),
    } as DeployModulePayload);
}

export async function initializeSmartContract(
    connection: WalletConnection,
    account: string,
    moduleReference: string,
    schemas: string,
    revocationKeys: string
) {
    if (moduleReference === '') {
        throw new Error(`Set issuerMetaData`);
    }

    const parameter = {
        issuer_metadata: {
            hash: {
                None: [],
            },
            url: moduleReference,
        },
        storage_address: {
            index: 4791,
            subindex: 0,
        },
        schemas: JSON.parse(schemas),
        issuer: {
            None: [],
        },
        revocation_keys: JSON.parse(revocationKeys),
    } as SmartContractParameters;

    const schema = {
        parameters: parameter,
        schema: moduleSchemaFromBase64(CREDENTIAL_REGISTRY_BASE_64_SCHEMA),
    };

    return connection.signAndSendTransaction(
        account,
        AccountTransactionType.InitContract,
        {
            amount: new CcdAmount(BigInt(0)),
            moduleRef: new ModuleReference(moduleReference),
            initName: 'credential_registry',
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
