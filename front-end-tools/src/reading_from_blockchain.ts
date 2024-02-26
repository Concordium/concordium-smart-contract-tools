import {
    toBuffer,
    ConcordiumGRPCClient,
    deserializeReceiveReturnValue,
    serializeUpdateContractParameters,
    ModuleReference,
    AccountAddress,
    AccountInfo,
    ContractAddress,
    ContractName,
    EntrypointName,
    ReceiveName,
    Parameter,
    ReturnValue,
} from '@concordium/web-sdk';
import JSONbig from 'json-bigint';
import { CONTRACT_SUB_INDEX } from './constants';
import { decodeRejectReason } from './utils';

/**
 * Retrieves information about a given smart contract instance.
 *
 * @param rpcClient the rpcClient to query.
 * @param contractIndex the contract index (part of the smart contract address).
 *
 * @returns An object with information about the contract instance. The object contains the contractName, the methods, and the sourceModule.
 * @throws If the `rpcClient` is undefined.
 * @throws If the `contractIndex` is undefined.
 */
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

    return { contractName, methods, sourceModule: info.sourceModule };
}

/**
 * Retrieves information about module source of a module reference.
 *
 * @param rpcClient the rpcClient to query.
 * @param moduleRef the module's reference, represented by the ModuleReference class.
 *
 * @returns the source of the module as raw bytes.
 * @throws If the `rpcClient` is undefined.
 * @throws If the `moduleRef` is undefined.
 */
export async function getModuleSource(
    rpcClient: ConcordiumGRPCClient | undefined,
    moduleRef: ModuleReference.Type | undefined
) {
    if (rpcClient === undefined) {
        throw new Error(`rpcClient undefined`);
    }
    if (moduleRef === undefined) {
        throw new Error(`Set module ref`);
    }

    return rpcClient.getModuleSource(moduleRef);
}

/**
 * Retrieves the embedded schema of the given module.
 *
 * @param rpcClient the rpcClient to query.
 * @param moduleRef the module's reference, represented by the ModuleReference class.
 *
 * @returns the module schema as a buffer.
 * @throws If the `rpcClient` is undefined.
 * @throws If the `moduleRef` is undefined.
 */
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

/**
 * Retrieves the account info for the specified account. If the request to the node is successful, this function updates
 * the account balance with the `setAccountBalance` hook and updates the account existence status using the `setAccountExistsOnNetwork` hook.
 * If the request to the node fails, the error returned is written to the `setViewErrorAccountInfo` hook.
 *
 * @param rpcClient the rpcClient to query.
 * @param accountIdentifier the string in base58 encoding representing the account address.
 * @param setAccountBalance a hook to update the account balance.
 * @param setAccountExistsOnNetwork a hook to update the account existence status.
 * @param setViewErrorAccountInfo a hook to write the error to in case the request to the node fails.
 */
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

/**
 * Invokes a smart contract entry point and returns its return value.
 * This function expects that the entry point is a `typical` smart contract view/read/getter function that returns a return value.
 * This function throws an error if the entry point does not return a return value.
 * If the moduleSchema parameter is undefined, the return value is in raw bytes.
 * If a valid moduleSchema is provided, the return value is deserialized.
 *
 * @param rpcClient the rpcClient to query.
 * @param contractName the contract name to be invoked.
 * @param contractIndex the contract index to be invoked.
 * @param entryPoint an optional entry point to be invoked. This function will throw if the entryPoint is undefined.
 * @param hasInputParameter a boolean signaling if the invoke should be executed with an input parameter.
 * @param inputParameter an optional input parameter.
 * @param inputParameterType an optional input parameter type (`string`/`number`/`array`/`object`).
 * @param moduleSchema an optional module schema to serialize the input parameter and deserialize the return value.
 * @param deriveContractInfoFromIndex a boolean signaling if values were derived from the contract index or manually inputted by the user.
 *
 * @returns the return value from the smart contract invoke in raw bytes (if no valid moduleSchema is provided) or deserialized (if a valid moduleSchema is provided).
 * @throws If the `rpcClient` is undefined.
 * @throws If the `entryPoint` is undefined.
 * @throws If the `hasInputParameter` is true but the input parameter cannot be serialized.
 * @throws If the request to the node fails.
 * @throws In case of a valid moduleSchema: if the deserialization of the return value fails.
 */
export async function read(
    rpcClient: ConcordiumGRPCClient | undefined,
    contractName: ContractName.Type,
    contractIndex: bigint,
    entryPoint: EntrypointName.Type | undefined,
    hasInputParameter: boolean,
    inputParameter: string | undefined,
    inputParameterType: string | undefined,
    moduleSchema: string | undefined,
    deriveContractInfoFromIndex: boolean
) {
    if (rpcClient === undefined) {
        throw new Error(`rpcClient undefined`);
    }

    if (entryPoint === undefined) {
        throw new Error(`Set entry point name`);
    }

    let param = Parameter.empty();

    if (hasInputParameter) {
        if (!deriveContractInfoFromIndex && moduleSchema === undefined) {
            throw new Error(`Set schema`);
        } else if (deriveContractInfoFromIndex && moduleSchema === undefined) {
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

    const fullEntryPointName = `${contractName.value}.${entryPoint.value}`;

    if (!res || res.tag === 'failure') {
        const [rejectReasonCode, humanReadableError] = decodeRejectReason(res, contractName, entryPoint, moduleSchema);

        throw new Error(
            `RPC call 'invokeContract' on method '${fullEntryPointName}' of contract '${contractIndex}' failed.
            ${rejectReasonCode !== undefined ? `Reject reason code: ${rejectReasonCode}.` : ''} ${
                humanReadableError !== undefined
                    ? `Prettified reject reason: ${humanReadableError} (Warning: Prettified reject reason is not guaranteed to be correct.
                    Check smart contract code to ensure error codes have not been overwritten.)`
                    : ''
            }`
        );
    }

    if (!res.returnValue) {
        throw new Error(
            `RPC call 'invokeContract' on method '${fullEntryPointName}' of contract '${contractIndex}' returned no return_value`
        );
    }

    if (moduleSchema === undefined) {
        // If no schema is provided return the raw bytes
        return JSONbig.stringify(res.returnValue);
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
            `Deserializing the returnValue from the '${fullEntryPointName}' method of contract '${contractIndex}' failed. Original error: ${e}`
        );
    }

    if (returnValue === undefined) {
        throw new Error(
            `Deserializing the returnValue from the '${fullEntryPointName}' method of contract '${contractIndex}' failed.`
        );
    } else {
        return JSONbig.stringify(returnValue);
    }
}
