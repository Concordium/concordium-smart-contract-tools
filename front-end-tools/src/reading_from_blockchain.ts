import {
    toBuffer,
    ConcordiumGRPCClient,
    AccountAddress,
    deserializeReceiveReturnValue,
    serializeUpdateContractParameters,
} from '@concordium/web-sdk';

import { CONTRACT_SUB_INDEX } from './constants';

export async function read(
    rpcClient: ConcordiumGRPCClient | undefined,
    contractName: string,
    contractIndex: bigint,
    entryPoint: string,
    moduleSchema: string | undefined,
    inputParameter: string,
    dropDown: string,
    hasInputParameter: boolean,
    useModuleFromStep1: boolean
) {
    if (rpcClient === undefined) {
        throw new Error(`rpcClient undefined`);
    }

    let param = toBuffer('', 'hex');

    if (hasInputParameter) {
        if (!useModuleFromStep1 && moduleSchema === undefined) {
            throw new Error(`Set schema`);
        } else if (useModuleFromStep1 && moduleSchema === undefined) {
            throw new Error(`No embedded module schema found in module`);
        }

        let inputParameterFormated;

        if (hasInputParameter) {
            switch (dropDown) {
                case 'number':
                    inputParameterFormated = Number(inputParameter);
                    break;
                case 'string':
                    inputParameterFormated = inputParameter;
                    break;
                case 'object':
                    inputParameterFormated = JSON.parse(inputParameter);
                    break;
                case 'array':
                    inputParameterFormated = JSON.parse(inputParameter);
                    break;
                default:
                    throw new Error(`Dropdown option does not exist`);
            }
        }

        if (moduleSchema !== undefined) {
            param = serializeUpdateContractParameters(
                contractName,
                entryPoint,
                inputParameterFormated,
                toBuffer(moduleSchema, 'base64')
            );
        }
    }

    const res = await rpcClient.invokeContract({
        method: `${contractName}.${entryPoint}`,
        contract: { index: contractIndex, subindex: CONTRACT_SUB_INDEX },
        parameter: param,
    });

    if (!res || res.tag === 'failure' || !res.returnValue) {
        throw new Error(
            `RPC call 'invokeContract' on method '${contractName}.${entryPoint}' of contract '${contractIndex}' failed`
        );
    }

    if (moduleSchema === undefined || moduleSchema === '') {
        // If no schema is provided return the raw bytes
        return JSON.stringify(res.returnValue);
    }

    // If schema is provided deserialize return value
    const returnValue = deserializeReceiveReturnValue(
        toBuffer(res.returnValue, 'hex'),
        toBuffer(moduleSchema, 'base64'),
        contractName,
        entryPoint
    );

    if (returnValue === undefined) {
        throw new Error(
            `Deserializing the returnValue from the '${contractName}.${entryPoint}' method of contract '${contractIndex}' failed`
        );
    } else {
        return JSON.stringify(returnValue);
    }
}

export async function accountInfo(rpcClient: ConcordiumGRPCClient, account: string) {
    return rpcClient.getAccountInfo(new AccountAddress(account));
}

// export async function smartContractInfo(rpcClient: ConcordiumGRPCClient) {
//     return rpcClient.getInstanceInfo({ index: CONTRACT_INDEX, subindex: CONTRACT_SUB_INDEX });
// }
