import {
    toBuffer,
    InvokeContractFailedResult,
    RejectedReceive,
    deserializeReceiveError,
    EntrypointName,
    ContractName,
} from '@concordium/web-sdk';
import { EXAMPLE_ARRAYS, EXAMPLE_JSON_OBJECT } from './constants';

export function arraysEqual(a: Uint8Array, b: Uint8Array) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function getObjectExample(template: string | undefined) {
    return template !== undefined
        ? JSON.stringify(JSON.parse(template), undefined, 2)
        : JSON.stringify(EXAMPLE_JSON_OBJECT, undefined, 2);
}

export function getArrayExample(template: string | undefined) {
    return template !== undefined ? JSON.stringify(JSON.parse(template), undefined, 2) : EXAMPLE_ARRAYS;
}

/**
 * Decodes the reason for the transaction failure into a human-readable format.
 *
 * If the error is NOT caused by a smart contract logical revert, this function returns the reason in a human-readable format as follows:
 * - `a human-readable rejectReason tag`. This can happen for example if the transaction runs out of energy. Such errors have tags that are human-readable (e.g. "OutOfEnergy").
 *
 * If the error is caused by a smart contract logical revert, this function returns the reason as follows:
 *  - `a rejectReason code` if NO error schema is provided (e.g. -1, -2, -3, ...).
 *  - `a human-readable error string` if an error schema is provided in the moduleSchema. This error schema is used to decode the above `rejectReason code` into a human-readable string.
 *
 * @param failedResult the failed invoke contract result.
 * @param contractName the name of the contract.
 * @param entryPoint the entry point name.
 * @param moduleSchema an optional module schema. If provided, the rejectReason code as logged by the smart contract can be decoded into a human-readable error string.
 *
 * @returns a decoded human-readable reject reason string (falls back to return the error codes if a missing schema prevents the function from decoding the error codes into human-readable strings).
 */
export function decodeRejectReason(
    failedResult: InvokeContractFailedResult,
    contractName: ContractName.Type,
    entryPoint: EntrypointName.Type,
    moduleSchema: string | undefined
) {
    let rejectReason;

    const errorReason = failedResult.reason;

    if (errorReason.tag === 'RejectedReceive') {
        // If the error is due to a logical smart contract revert (`RejectedReceive` type),
        // get the rejectReason code (e.g. -1, -2, -3).
        rejectReason = ((failedResult as InvokeContractFailedResult)?.reason as RejectedReceive)?.rejectReason;

        // If a module schema is provided, deserialize the reject reason into a human-readable string.
        if (moduleSchema !== undefined) {
            // Note: The rejectReason codes are converted to the byte tags of the enum type in Rust. Errors are represented as an enum type in Concordium smart contracts.
            // -1 => 0x00
            // -2 => 0x01
            // -3 => 0x02
            // -4 => 0x03
            // ...
            // This conversion works as long as there ares no more then 256 (one byte) of different errors in the smart contract which should be sufficient for practical smart contracts.
            const decodedError = deserializeReceiveError(
                Uint8Array.from([Math.abs(rejectReason) - 1]).buffer,
                toBuffer(moduleSchema, 'base64'),
                contractName,
                entryPoint
            );

            // The object only includes one key. Its key is the human-readable error string.
            const key = Object.keys(decodedError);

            // Convert the human-readable error to a JSON string.
            rejectReason = JSON.stringify(key);
        }
    } else {
        // If the error is not due to a logical smart contract revert, return the `errorReasonTag` instead (e.g. if the transactions runs out of energy)
        rejectReason = errorReason.tag;
    }

    return rejectReason;
}
