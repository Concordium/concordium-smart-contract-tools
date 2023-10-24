import {
    toBuffer,
    ConcordiumGRPCClient,
    deserializeReceiveReturnValue,
    serializeUpdateContractParameters,
    ModuleReference,
} from '@concordium/web-sdk';

import { CONTRACT_SUB_INDEX } from './constants';

export async function getContractInfo(rpcClient: ConcordiumGRPCClient | undefined, contractIndex: bigint) {
    if (rpcClient === undefined) {
        throw new Error(`rpcClient undefined`);
    }
    if (contractIndex === undefined) {
        throw new Error(`Set smart contract index`);
    }

    const info = await rpcClient.getInstanceInfo({ index: contractIndex, subindex: CONTRACT_SUB_INDEX });

    // Removing the `init_` prefix.
    const contractName = info.name.substring(5);

    // Removing the `contractName.` prefix.
    const methods = info.methods.map((element) => element.substring(contractName.length + 1));

    const returnValue = { contractName, methods, sourceModule: info.sourceModule };
    return returnValue;
}

export async function getEmbeddedSchema(
    rpcClient: ConcordiumGRPCClient | undefined,
    moduleRef: ModuleReference | undefined
) {
    if (rpcClient === undefined) {
        throw new Error(`rpcClient undefined`);
    }
    if (moduleRef === undefined) {
        throw new Error(`Set module ref`);
    }

    return rpcClient.getEmbeddedSchema(moduleRef);
}

export async function read(
    rpcClient: ConcordiumGRPCClient | undefined,
    contractName: string | undefined,
    contractIndex: bigint,
    entryPoint: string | undefined,
    moduleSchema: string | undefined,
    inputParameter: string | undefined,
    dropDown: string,
    hasInputParameter: boolean,
    deriveFromSmartContractIndex: boolean
) {
    if (rpcClient === undefined) {
        throw new Error(`rpcClient undefined`);
    }
    if (contractName === undefined) {
        throw new Error(`Set contract name`);
    }

    if (entryPoint === undefined) {
        throw new Error(`Set entry point name`);
    }

    let param = toBuffer('', 'hex');

    if (hasInputParameter) {
        if (!deriveFromSmartContractIndex && moduleSchema === undefined) {
            throw new Error(`Set schema`);
        } else if (deriveFromSmartContractIndex && moduleSchema === undefined) {
            throw new Error(`No embedded module schema found in module`);
        }

        let inputParameterFormated;

        if (inputParameter === undefined) {
            throw new Error(`Set input parameter`);
        }

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

    if (moduleSchema === undefined) {
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
