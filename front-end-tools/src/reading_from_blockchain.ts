import { toBuffer, deserializeTypeValue, ConcordiumGRPCClient, AccountAddress } from '@concordium/web-sdk';

import { CONTRACT_SUB_INDEX } from './constants';

export async function read(
    rpcClient: ConcordiumGRPCClient | undefined,
    contractName: string,
    contractIndex: bigint,
    entryPoint: string,
    module_schema: string | undefined
) {
    if (rpcClient === undefined) {
        throw new Error(`rpcClient undefined`);
    }

    const res = await rpcClient.invokeContract({
        method: `${contractName}.${entryPoint}`,
        contract: { index: contractIndex, subindex: CONTRACT_SUB_INDEX },
    });

    if (!res || res.tag === 'failure' || !res.returnValue) {
        throw new Error(
            `RPC call 'invokeContract' on method '${contractName}.${entryPoint}' of contract '${contractIndex}' failed`
        );
    }

    if (module_schema === undefined || module_schema === '') {
        // If no schema is provided return the raw bytes
        return res.returnValue;
    }
    // If schema is provided deserialize return value
    const state = deserializeTypeValue(toBuffer(res.returnValue, 'hex'), toBuffer(module_schema, 'base64'));

    if (state === undefined) {
        throw new Error(
            `Deserializing the returnValue from the '${contractName}.${entryPoint}' method of contract '${contractIndex}' failed`
        );
    } else {
        return JSON.stringify(state);
    }
}

export async function accountInfo(rpcClient: ConcordiumGRPCClient, account: string) {
    return rpcClient.getAccountInfo(new AccountAddress(account));
}

// export async function smartContractInfo(rpcClient: ConcordiumGRPCClient) {
//     return rpcClient.getInstanceInfo({ index: CONTRACT_INDEX, subindex: CONTRACT_SUB_INDEX });
// }
