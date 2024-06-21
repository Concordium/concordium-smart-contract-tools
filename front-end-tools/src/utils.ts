import {
    toBuffer,
    InvokeContractFailedResult,
    RejectedReceive,
    deserializeReceiveError,
    EntrypointName,
    ContractName,
    ReturnValue,
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

/**
 * Decodes a `Uint8Array` into a hex string.
 * @param uint8Array the `Uint8Array`.
 *
 * @returns a hex string.
 */
export function uint8ArrayToHexString(uint8Array: Uint8Array) {
    return Array.from(uint8Array)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
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
 * Decodes the `rejectReasonCode` manually into a human-readable string based on the error code definition in the `concordium-std` crate.
 * @param rejectReasonCode the reject reason error code.
 *
 * @returns a decoded human-readable error string if the error code is defined in the `concordium-std` crate otherwise returns `undefined`.
 */
export function decodeConcordiumStdError(rejectReasonCode: number | undefined) {
    let humanReadableError;

    switch (rejectReasonCode) {
        // Check if the `rejectReason` comes from the `concordium-std` crate, and decode it into human-readable strings.
        case -2147483647:
            humanReadableError = '`[Error ()]`';
            break;
        case -2147483646:
            humanReadableError = '`[ParseError]`';
            break;
        case -2147483645:
            humanReadableError = '`[LogError::Full]`';
            break;
        case -2147483644:
            humanReadableError = '`[LogError::Malformed]`';
            break;
        case -2147483643:
            humanReadableError = '`[NewContractNameError::MissingInitPrefix]`';
            break;
        case -2147483642:
            humanReadableError = '`[NewContractNameError::TooLong]`';
            break;
        case -2147483641:
            humanReadableError = '`[NewReceiveNameError::MissingDotSeparator]`';
            break;
        case -2147483640:
            humanReadableError = '`[NewReceiveNameError::TooLong]`';
            break;
        case -2147483639:
            humanReadableError = '`[NewContractNameError::ContainsDot]`';
            break;
        case -2147483638:
            humanReadableError = '`[NewContractNameError::InvalidCharacters]`';
            break;
        case -2147483637:
            humanReadableError = '`[NewReceiveNameError::InvalidCharacters]`';
            break;
        case -2147483636:
            humanReadableError = '`[NotPayableError]`';
            break;
        case -2147483635:
            humanReadableError = '`[TransferError::AmountTooLarge]`';
            break;
        case -2147483634:
            humanReadableError = '`[TransferError::MissingAccount]`';
            break;
        case -2147483633:
            humanReadableError = '`[CallContractError::AmountTooLarge]`';
            break;
        case -2147483632:
            humanReadableError = '`[CallContractError::MissingAccount]`';
            break;
        case -2147483631:
            humanReadableError = '`[CallContractError::MissingContract]`';
            break;
        case -2147483630:
            humanReadableError = '`[CallContractError::MissingEntrypoint]`';
            break;
        case -2147483629:
            humanReadableError = '`[CallContractError::MessageFailed]`';
            break;
        case -2147483628:
            humanReadableError = '`[CallContractError::LogicReject]`';
            break;
        case -2147483627:
            humanReadableError = '`[CallContractError::Trap]`';
            break;
        case -2147483626:
            humanReadableError = '`[UpgradeError::MissingModule]`';
            break;
        case -2147483625:
            humanReadableError = '`[UpgradeError::MissingContract]`';
            break;
        case -2147483624:
            humanReadableError = '`[UpgradeError::UnsupportedModuleVersion]`';
            break;
        case -2147483623:
            humanReadableError = '`[QueryAccountBalanceError]`';
            break;
        case -2147483622:
            humanReadableError = '`[QueryContractBalanceError]`';
            break;
        default:
            humanReadableError = undefined;
    }

    return humanReadableError;
}

/**
 * Decodes the reason for the transaction failure. Depending on the type of the error and if an error schema in the module schema is provided,
 * this function decodes the error as much as possible. The assumption is that the error codes have not been overwritten in the smart contract.
 * The function returns a reject reason code and/or a human-readable error.
 *
 * If the error is NOT caused by a smart contract logical revert, this function returns the reason in a human-readable format as follows:
 * - `humanReadableError = a human-readable rejectReason tag; rejectReasonCode = undefined)`. This can happen for example if the transaction runs out of energy. Such errors have tags that are human-readable (e.g. "OutOfEnergy").
 *
 * If the error is caused by a smart contract logical revert coming from the smart contract itself, this function returns the reason as follows:
 *  - If NO error schema is provided:
 *    `humanReadableError = undefined; rejectReasonCode = a rejectReason code as defined in the smart contract (e.g. -1, -2, -3, ...)`.
 *  - If an error schema is provided in the moduleSchema:
 *    `humanReadableError = a human-readable error string; rejectReasonCode = a rejectReason code as defined in the smart contract`. The error schema is used to decode the `rejectReasonCode` into a human-readable string.
 *
 * If the error is caused by a smart contract logical revert coming from the `concordium-std` crate, this function returns the reason in a human-readable format as well as the reject reason code as follows:
 * - `humanReadableError = a human-readable error string decoded from the `concordium-std` crate error codes; rejectReasonCode = reject reason code from the `concordium-std` crate`.
 *
 * @param failedResult the failed invoke contract result.
 * @param contractName the name of the contract.
 * @param entryPoint the entry point name.
 * @param moduleSchema an optional module schema including an error schema. If provided, the rejectReason code as logged by the smart contract can be decoded into a human-readable error string.
 *
 * @returns a decoded human-readable reject reason string and/or error codes.
 */
export function decodeRejectReason(
    failedResult: InvokeContractFailedResult,
    contractName: ContractName.Type,
    entryPoint: EntrypointName.Type,
    moduleSchema: string | undefined
) {
    let rejectReasonCode;

    const errorReason = failedResult.reason;

    let humanReadableError;

    if (errorReason.tag === 'RejectedReceive') {
        // If the error is due to a logical smart contract revert (`RejectedReceive` type), get the `rejectReason` code.
        // e.g. -1, -2, ... (if the error comes from the smart contract).
        // e,g, -2147483647, -2147483646, ... (if the error comes from the `concordium-std` crate).
        rejectReasonCode = ((failedResult as InvokeContractFailedResult)?.reason as RejectedReceive)?.rejectReason;

        // The `NotPayableError (-2147483636)` is special since it is the only error from the `concordium-std` crate which is not matched to a smart contract error in a valid errorSchema embedded in the module.
        if (rejectReasonCode !== -2147483636) {
            // If the `rejectReason` comes from the smart contract itself (e.g. -1, -2, -3, ...)
            // and an error schema is provided in the module schema, deserialize the reject reason into a human-readable string.
            // This is the recommended way to represent errors. As a result, we try first
            // to deserialize the error with the schema before falling back to decode the `concordium-std` crate errors manually.
            // Only the `NotPayableError` is treated special since it has no matched error in the errorSchema.
            if (moduleSchema !== undefined && failedResult.returnValue !== undefined) {
                try {
                    const decodedError = deserializeReceiveError(
                        ReturnValue.toBuffer(failedResult.returnValue),
                        toBuffer(moduleSchema, 'base64'),
                        contractName,
                        entryPoint
                    );
                    // The object only includes one key. Its key is the human-readable error string.
                    const key = Object.keys(decodedError);

                    // Convert the human-readable error to a JSON string.
                    humanReadableError = JSON.stringify(key);
                } catch (_error) {
                    // Falling back to decode the `concordium-std` crate errors manually
                    // Decode the `rejectReason` based on the error codes defined in `concordium-std` crate, and decode it into a human-readable string if possible.
                    humanReadableError = decodeConcordiumStdError(rejectReasonCode);
                }
            } else {
                // Falling back to decode the `concordium-std` crate errors manually
                // Decode the `rejectReason` based on the error codes defined in `concordium-std` crate, and decode it into a human-readable string if possible.
                humanReadableError = decodeConcordiumStdError(rejectReasonCode);
            }
        } else {
            // Falling back to decode the `concordium-std` crate errors manually
            // Decode the `rejectReason` based on the error codes defined in `concordium-std` crate, and decode it into a human-readable string if possible.
            humanReadableError = '`[NotPayableError]`';
        }
    } else {
        // If the error is not due to a logical smart contract revert, return the `errorReasonTag` instead (e.g. if the transaction runs out of energy)
        humanReadableError = `\`[${errorReason.tag}]\``;
    }

    return [rejectReasonCode, humanReadableError];
}
