import {
    toBuffer,
    ConcordiumGRPCClient,
    deserializeReceiveReturnValue,
    serializeUpdateContractParameters,
    ModuleReference,
    InvokeContractFailedResult,
    RejectedReceive,
    AccountAddress,
    AccountInfo,
    ContractAddress,
    ContractName,
    EntrypointName,
    ReceiveName,
    Parameter,
    ReturnValue,
} from '@concordium/web-sdk';

import { CONTRACT_SUB_INDEX } from './constants';

/** This function gets the contract info of a smart contract index. */
export async function getContractInfo(rpcClient: ConcordiumGRPCClient | undefined, contractIndex: bigint) {
    if (rpcClient === undefined) {
        throw new Error(`rpcClient undefined`);
    }
    if (contractIndex === undefined) {
        throw new Error(`Set smart contract index`);
    }

    const info = await rpcClient.getInstanceInfo(ContractAddress.create(contractIndex, CONTRACT_SUB_INDEX));

    // Removing the `init_` prefix.
    const contractName = ContractName.fromInitName(info.name);

    // Removing the `contractName.` prefix.
    const methods = info.methods.map(ReceiveName.toEntrypointName);

    const returnValue = { contractName, methods, sourceModule: info.sourceModule };
    return returnValue;
}

/** This function gets the embedded schema of a module reference. */
export async function getEmbeddedSchema(
    rpcClient: ConcordiumGRPCClient | undefined,
    moduleRef: ModuleReference.Type | undefined
) {
    if (rpcClient === undefined) {
        throw new Error(`rpcClient undefined`);
    }
    if (moduleRef === undefined) {
        throw new Error(`Set module ref`);
    }

    return rpcClient.getEmbeddedSchema(moduleRef);
}

/** This function gets the account info and its balance. */
export function getAccountInfo(
    client: ConcordiumGRPCClient,
    account: string,
    setAccountBalance: (arg0: undefined | string) => void,
    setAccountExistsOnNetwork: (arg0: boolean) => void,
    setViewErrorAccountInfo: (arg0: undefined | string) => void
) {
    client
        .getAccountInfo(AccountAddress.fromBase58(account))
        .then((value: AccountInfo) => {
            if (value !== undefined) {
                setAccountBalance(value.accountAmount.microCcdAmount.toString());
                setAccountExistsOnNetwork(true);
            } else {
                setAccountExistsOnNetwork(false);
            }
            setViewErrorAccountInfo(undefined);
        })
        .catch((e) => {
            setAccountBalance(undefined);
            setViewErrorAccountInfo((e as Error).message.replaceAll('%20', ' '));
            setAccountExistsOnNetwork(false);
        });
}

/** This function invokes a smart contract entry point and returns its return_value.
 * This function expects that the entry point is a `typical` smart contract view/read/getter function that returns a return_value.
 * This function throws an error if the entry point does not return a return_value.
 * If the moduleSchema parameter is undefined, the return_value is in raw bytes.
 * If a valid moduleSchema is provided, the return_value is deserialized.
 */
export async function read(
    rpcClient: ConcordiumGRPCClient | undefined,
    contractName: ContractName.Type,
    contractIndex: bigint,
    entryPoint: EntrypointName.Type | undefined,
    moduleSchema: string | undefined,
    inputParameter: string | undefined,
    inputParameterType: string | undefined,
    hasInputParameter: boolean,
    deriveContractInfo: boolean
) {
    if (rpcClient === undefined) {
        throw new Error(`rpcClient undefined`);
    }

    if (entryPoint === undefined) {
        throw new Error(`Set entry point name`);
    }

    let param = Parameter.empty();

    if (hasInputParameter) {
        if (!deriveContractInfo && moduleSchema === undefined) {
            throw new Error(`Set schema`);
        } else if (deriveContractInfo && moduleSchema === undefined) {
            throw new Error(`No embedded module schema found in module`);
        }

        if (inputParameterType === undefined) {
            throw new Error(`Select input parameter type`);
        }

        let inputParameterFormatted;

        if (inputParameter === undefined) {
            throw new Error(`Set input parameter`);
        }

        switch (inputParameterType) {
            case 'number':
                inputParameterFormatted = Number(inputParameter);
                break;
            case 'string':
                inputParameterFormatted = inputParameter;
                break;
            case 'object':
                inputParameterFormatted = JSON.parse(inputParameter);
                break;
            case 'array':
                inputParameterFormatted = JSON.parse(inputParameter);
                break;
            default:
                throw new Error(`InputParameterType does not exist`);
        }

        if (moduleSchema !== undefined) {
            param = serializeUpdateContractParameters(
                contractName,
                entryPoint,
                inputParameterFormatted,
                toBuffer(moduleSchema, 'base64')
            );
        }
    }

    const res = await rpcClient.invokeContract({
        method: ReceiveName.create(contractName, entryPoint),
        contract: ContractAddress.create(contractIndex, CONTRACT_SUB_INDEX),
        parameter: param,
    });

    if (!res || res.tag === 'failure') {
        const rejectReason = JSON.stringify(
            ((res as InvokeContractFailedResult)?.reason as RejectedReceive)?.rejectReason
        );

        throw new Error(
            `RPC call 'invokeContract' on method '${contractName}.${entryPoint}' of contract '${contractIndex}' failed.
            ${rejectReason !== undefined ? `Reject reason: ${rejectReason}` : ''}`
        );
    }
    if (!res.returnValue) {
        throw new Error(
            `RPC call 'invokeContract' on method '${contractName}.${entryPoint}' of contract '${contractIndex}' returned no return_value`
        );
    }

    if (moduleSchema === undefined) {
        // If no schema is provided return the raw bytes
        return JSON.stringify(res.returnValue);
    }

    let returnValue;

    try {
        // If schema is provided deserialize return value
        returnValue = deserializeReceiveReturnValue(
            ReturnValue.toBuffer(res.returnValue),
            toBuffer(moduleSchema, 'base64'),
            contractName,
            entryPoint
        );
    } catch (e) {
        throw new Error(
            `Deserializing the returnValue from the '${contractName}.${entryPoint}' method of contract '${contractIndex}' failed. Original error: ${e}`
        );
    }

    if (returnValue === undefined) {
        throw new Error(
            `Deserializing the returnValue from the '${contractName}.${entryPoint}' method of contract '${contractIndex}' failed.`
        );
    } else {
        return JSON.stringify(returnValue);
    }
}
