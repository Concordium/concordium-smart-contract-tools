/* eslint-disable no-console */
import React, { useEffect, useState, PropsWithChildren } from 'react';
import { useForm } from 'react-hook-form';
import Select from 'react-select';
import { Alert, Button, Form, Row } from 'react-bootstrap';

import { WalletConnection } from '@concordium/react-components';
import {
    ModuleReference,
    TransactionKindString,
    TransactionSummaryType,
    displayTypeSchemaTemplate,
    toBuffer,
    getUpdateContractParameterSchema,
    ConcordiumGRPCClient,
} from '@concordium/web-sdk';

import { write } from './writing_to_blockchain';
import { getEmbeddedSchema, getContractInfo } from './reading_from_blockchain';
import { getObjectExample, getArrayExample } from './utils';
import { REFRESH_INTERVAL, INPUT_PARAMETER_TYPES_OPTIONS } from './constants';
import { TxHashLink } from './CCDScanLinks';

type BoxProps = PropsWithChildren<{
    header: string;
}>;

function Box({ header, children }: BoxProps) {
    return (
        <fieldset className="box">
            <legend>{header}</legend>
            <div className="boxFields">{children}</div>
            <br />
        </fieldset>
    );
}

interface ConnectionProps {
    isTestnet: boolean;
    account: string;
    connection: WalletConnection;
    client: ConcordiumGRPCClient | undefined;
}

interface FunctionState {
    initFunction: undefined | string;
    readFunction: undefined | string;
    writeFunction: undefined | string;
}

export default function WriteComponenet(props: ConnectionProps) {
    const { isTestnet, account, connection, client } = props;

    const writeForm = useForm<{
        smartContractIndex: number;
        smartContractName: string | undefined;
        entryPointName: string | undefined;
        file: FileList | undefined;
        hasInputParameter: boolean;
        deriveFromSmartContractIndex: boolean;
        inputParameterType: string | undefined;
        inputParameter: string | undefined;
        maxExecutionEnergy: number;
        isPayable: boolean;
        cCDAmount: number;
    }>();
    const deriveContractInfo = writeForm.watch('deriveFromSmartContractIndex');
    const hasInputParameter = writeForm.watch('hasInputParameter');
    const entryPointName = writeForm.watch('entryPointName');
    const smartContractName = writeForm.watch('smartContractName');
    const inputParameterType = writeForm.watch('inputParameterType');

    const isPayable = writeForm.watch('isPayable');

    const [uploadErrorWrite, setUploadErrorWrite] = useState<string | undefined>(undefined);
    const [parsingErrorWrite, setParsingErrorWrite] = useState<string | undefined>(undefined);
    const [schemaError, setSchemaError] = useState<FunctionState>({
        initFunction: undefined,
        readFunction: undefined,
        writeFunction: undefined,
    });

    const [shouldWarnInputParameterInSchemaIgnored, setShouldWarnInputParameterInSchemaIgnored] = useState({
        initFunction: false,
        readFunction: false,
        writeFunction: false,
    });

    const [transactionErrorUpdate, setTransactionErrorUpdate] = useState<string | undefined>(undefined);
    const [txHashUpdate, setTxHashUpdate] = useState<string | undefined>(undefined);
    const [uploadedModuleSchemaBase64Write, setUploadedModuleSchemaBase64Write] = useState<string | undefined>(
        undefined
    );

    const [contractInstanceInfo, setContractInstanceInfo] = useState<
        { contractName: string; methods: string[]; sourceModule: ModuleReference } | undefined
    >(undefined);
    const [writeError, setWriteError] = useState<string | undefined>(undefined);

    const [entryPointTemplateWriteFunction, setEntryPointTemplateWriteFunction] = useState<string | undefined>(
        undefined
    );

    const [writeTransactionOutcome, setWriteTransactionOutcome] = useState<string | undefined>(undefined);

    const [embeddedModuleSchemaBase64Write, setEmbeddedModuleSchemaBase64Write] = useState<string | undefined>(
        undefined
    );

    // Refresh writeTransactionOutcome periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && account && txHashUpdate !== undefined) {
            const interval = setInterval(() => {
                console.log('refreshing_writeTransactionOutcome');
                client
                    .getBlockItemStatus(txHashUpdate)
                    .then((report) => {
                        if (report !== undefined) {
                            if (report.status === 'finalized') {
                                if (
                                    report.outcome.summary.type === TransactionSummaryType.AccountTransaction &&
                                    report.outcome.summary.transactionType === TransactionKindString.Update
                                ) {
                                    setWriteTransactionOutcome('Success');
                                    clearInterval(interval);
                                } else {
                                    setWriteTransactionOutcome('Fail');
                                    clearInterval(interval);
                                }
                            }
                        }
                    })
                    .catch((e) => {
                        setWriteTransactionOutcome(`Fail; Error: ${(e as Error).message}`);
                        clearInterval(interval);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
        }
    }, [connection, account, client, txHashUpdate]);

    useEffect(() => {
        if (entryPointTemplateWriteFunction !== undefined && hasInputParameter === false) {
            setShouldWarnInputParameterInSchemaIgnored({
                ...shouldWarnInputParameterInSchemaIgnored,
                writeFunction: true,
            });
        } else {
            setShouldWarnInputParameterInSchemaIgnored({
                ...shouldWarnInputParameterInSchemaIgnored,
                writeFunction: false,
            });
        }
    }, [entryPointTemplateWriteFunction, hasInputParameter]);

    useEffect(() => {
        setSchemaError({ ...schemaError, writeFunction: undefined });
        setEntryPointTemplateWriteFunction(undefined);

        let receiveTemplateWriteFunction;

        try {
            if (entryPointName === undefined) {
                throw new Error('Set entry point name');
            }

            if (smartContractName === undefined) {
                throw new Error('Set smart contract name');
            }

            let schema = '';

            const schemaFromModule = deriveContractInfo
                ? embeddedModuleSchemaBase64Write
                : uploadedModuleSchemaBase64Write;

            if (schemaFromModule !== undefined) {
                schema = schemaFromModule;
            }

            const writeFunctionTemplate = getUpdateContractParameterSchema(
                toBuffer(schema, 'base64'),
                smartContractName,
                entryPointName
            );

            receiveTemplateWriteFunction = displayTypeSchemaTemplate(writeFunctionTemplate);

            setEntryPointTemplateWriteFunction(receiveTemplateWriteFunction);
        } catch (e) {
            if (deriveContractInfo) {
                setSchemaError({
                    ...schemaError,
                    writeFunction: `Could not derive the embedded schema from the smart contract index. Uncheck "Derive From Smart Contract Index" checkbox to manually upload a schema or uncheck "Has Input Paramter" checkbox if this entrypoint has no input parameter. Original error: ${e}`,
                });
            } else {
                setSchemaError({
                    ...schemaError,
                    writeFunction: `Could not get schema from uploaded schema. Uncheck "Has Input Paramter" checkbox if this entrypoint has no input parameter. Original error: ${e}`,
                });
            }
        }

        if (receiveTemplateWriteFunction) {
            if (inputParameterType === 'array') {
                writeForm.setValue(
                    'inputParameter',
                    JSON.stringify(JSON.parse(receiveTemplateWriteFunction), undefined, 2)
                );
            } else if (inputParameterType === 'object') {
                writeForm.setValue(
                    'inputParameter',
                    JSON.stringify(JSON.parse(receiveTemplateWriteFunction), undefined, 2)
                );
            }
        }
    }, [entryPointName, hasInputParameter, smartContractName, uploadedModuleSchemaBase64Write, inputParameterType]);

    return (
        <Box header="Write To Smart Contract">
            <Form>
                <Row>
                    <Form.Group className="col-md-3 mb-3">
                        <Form.Label>Smart Contract Index</Form.Label>
                        <Form.Control
                            defaultValue={1999}
                            type="number"
                            min="0"
                            {...writeForm.register('smartContractIndex', { required: true })}
                        />
                        <Form.Text />
                        {writeForm.formState.errors.smartContractIndex && (
                            <Alert variant="info"> Smart contract index is required </Alert>
                        )}
                    </Form.Group>

                    {deriveContractInfo &&
                    contractInstanceInfo !== undefined &&
                    contractInstanceInfo.contractName !== undefined ? (
                        <Form.Group className="col-md-3 mb-3">
                            <Form.Label>Smart Contract Name</Form.Label>
                            <Form.Control
                                value={
                                    contractInstanceInfo?.contractName ? contractInstanceInfo.contractName : 'undefined'
                                }
                                disabled
                                {...writeForm.register('smartContractName', { required: true })}
                            />
                            {writeForm.formState.errors.smartContractName && (
                                <Alert variant="info"> Smart contract name is required </Alert>
                            )}
                            <Form.Text />
                        </Form.Group>
                    ) : (
                        <Form.Group className="col-md-3 mb-3">
                            <Form.Label>Smart Contract Name</Form.Label>
                            <Form.Control {...writeForm.register('smartContractName', { required: true })} />
                            {writeForm.formState.errors.smartContractName && (
                                <Alert variant="info"> Smart contract name is required </Alert>
                            )}
                            <Form.Text />
                        </Form.Group>
                    )}

                    {deriveContractInfo &&
                    contractInstanceInfo !== undefined &&
                    contractInstanceInfo.methods.length > 0 ? (
                        <Form.Group className="col-md-3 mb-3">
                            <Form.Label>Entry Point Name</Form.Label>
                            <Select
                                options={contractInstanceInfo.methods?.map((method) => ({
                                    value: method,
                                    label: method,
                                }))}
                                onChange={(e) => {
                                    writeForm.setValue('entryPointName', e?.value);
                                }}
                            />
                            <Form.Text />
                        </Form.Group>
                    ) : (
                        <Form.Group className="col-md-3 mb-3">
                            <Form.Label>Entry Point Name</Form.Label>
                            <Form.Control {...writeForm.register('entryPointName', { required: true })} />
                            {writeForm.formState.errors.entryPointName && (
                                <Alert variant="info"> Entry point name is required </Alert>
                            )}
                            <Form.Text />
                        </Form.Group>
                    )}

                    <Form.Group className="col-md-3 mb-3">
                        <Form.Label>Max Execution Energy:</Form.Label>
                        <Form.Control
                            defaultValue={30000}
                            type="number"
                            min="0"
                            {...writeForm.register('maxExecutionEnergy', { required: true })}
                        />
                        <Form.Text />
                        {writeForm.formState.errors.maxExecutionEnergy && (
                            <Alert variant="info"> Max execution energy is required </Alert>
                        )}
                    </Form.Group>
                </Row>

                <div className="row d-flex justify-content-center">
                    <Form.Group className="mb-3 d-flex justify-content-center">
                        <Form.Check
                            type="checkbox"
                            id="attribute-required"
                            label="Derive From Smart Contract Index"
                            {...writeForm.register('deriveFromSmartContractIndex')}
                            onChange={async (e) => {
                                const deriveFromSmartContractIndexRegister =
                                    writeForm.register('deriveFromSmartContractIndex');

                                deriveFromSmartContractIndexRegister.onChange(e);

                                setUploadedModuleSchemaBase64Write(undefined);
                                setSchemaError({
                                    ...schemaError,
                                    writeFunction: undefined,
                                });
                                writeForm.setValue('entryPointName', undefined);
                                setContractInstanceInfo(undefined);
                                setWriteError(undefined);
                                setEmbeddedModuleSchemaBase64Write(undefined);

                                const checkboxElement = writeForm.getValues('deriveFromSmartContractIndex');

                                if (checkboxElement) {
                                    const promiseContractInfo = getContractInfo(
                                        client,
                                        BigInt(writeForm.getValues('smartContractIndex'))
                                    );

                                    promiseContractInfo
                                        .then((contractInfo) => {
                                            const promise = getEmbeddedSchema(client, contractInfo.sourceModule);

                                            promise
                                                .then((embeddedSchema) => {
                                                    const schema = new Uint8Array(embeddedSchema);

                                                    const moduleSchemaBase64Embedded = btoa(
                                                        new Uint8Array(schema).reduce((data, byte) => {
                                                            return data + String.fromCharCode(byte);
                                                        }, '')
                                                    );

                                                    setEmbeddedModuleSchemaBase64Write(moduleSchemaBase64Embedded);
                                                    setContractInstanceInfo(contractInfo);
                                                    writeForm.setValue('smartContractName', contractInfo.contractName);
                                                })
                                                .catch((err: Error) => {
                                                    setWriteError((err as Error).message);
                                                });
                                        })
                                        .catch((err: Error) => setWriteError((err as Error).message));
                                }
                            }}
                        />
                    </Form.Group>
                </div>

                {deriveContractInfo && (
                    <>
                        <br />
                        <Alert variant="info">
                            <div>
                                This checkbox autofilled the <code>smart contract name</code>, the{' '}
                                <code>entry point name</code>, and the <code>receive parameter schema</code> from the
                                smart contract index.
                            </div>
                            <br />
                            <div>
                                <b>Uncheck</b> this box, if you want to manually fill in a{' '}
                                <code>smart contract name</code>, an <code>entry point name</code>, or a{' '}
                                <code>receive parameter schema</code>.
                            </div>
                            <br />
                            <div>
                                <b>Uncheck</b> and <b>check</b> this box again, if you want to load a new smart contract
                                index.
                            </div>
                        </Alert>
                    </>
                )}

                <Form.Group className="mb-3 d-flex justify-content-center">
                    <Form.Check
                        type="checkbox"
                        id="isPayable"
                        label="Is Payable"
                        {...writeForm.register('isPayable')}
                        onChange={async (e) => {
                            const isPayableRegister = writeForm.register('isPayable');

                            isPayableRegister.onChange(e);

                            writeForm.setValue('cCDAmount', 0);
                        }}
                    />
                </Form.Group>

                {isPayable && (
                    <Form.Group className=" mb-3">
                        <Form.Label>CCD amount (micro):</Form.Label>
                        <Form.Control
                            defaultValue={0}
                            type="number"
                            min="0"
                            {...writeForm.register('cCDAmount', { required: true })}
                        />
                        <Form.Text />
                        {writeForm.formState.errors.cCDAmount && <Alert variant="info"> cCDAmount is required </Alert>}
                    </Form.Group>
                )}

                <Form.Group className="mb-3 d-flex justify-content-center">
                    <Form.Check
                        type="checkbox"
                        id="hasInputParameter"
                        label="Has Input Parameter"
                        {...writeForm.register('hasInputParameter')}
                        onChange={async (e) => {
                            const hasInputParameterRegister = writeForm.register('hasInputParameter');

                            hasInputParameterRegister.onChange(e);

                            setParsingErrorWrite(undefined);
                            writeForm.setValue('inputParameterType', undefined);
                            writeForm.setValue('inputParameter', undefined);
                            setEntryPointTemplateWriteFunction(undefined);
                            setSchemaError({
                                ...schemaError,
                                writeFunction: undefined,
                            });
                        }}
                    />
                </Form.Group>

                {hasInputParameter && (
                    <div className="box">
                        {!deriveContractInfo && (
                            <Form.Group className="mb-3">
                                <Form.Label>Upload Smart Contract Module Schema File (e.g. schema.bin)</Form.Label>
                                <Form.Control
                                    type="file"
                                    accept=".bin"
                                    {...writeForm.register('file')}
                                    onChange={async (e) => {
                                        const fileRegister = writeForm.register('file');

                                        fileRegister.onChange(e);

                                        setUploadErrorWrite(undefined);
                                        setUploadedModuleSchemaBase64Write(undefined);

                                        const files = writeForm.getValues('file');

                                        if (files !== undefined && files !== null && files.length > 0) {
                                            const file = files[0];
                                            const arrayBuffer = await file.arrayBuffer();

                                            const schema = btoa(
                                                new Uint8Array(arrayBuffer).reduce((data, byte) => {
                                                    return data + String.fromCharCode(byte);
                                                }, '')
                                            );
                                            setUploadedModuleSchemaBase64Write(schema);
                                        } else {
                                            setUploadErrorWrite('Upload schema file is undefined');
                                        }
                                    }}
                                />
                                <Form.Text />
                            </Form.Group>
                        )}

                        {!deriveContractInfo && uploadedModuleSchemaBase64Write && (
                            <div className="actionResultBox">
                                Schema in base64:
                                <div>{uploadedModuleSchemaBase64Write.toString().slice(0, 30)} ...</div>
                            </div>
                        )}
                        {uploadErrorWrite !== undefined && <Alert variant="danger"> Error: {uploadErrorWrite}. </Alert>}
                        {writeError && <Alert variant="danger"> Error: {writeError}. </Alert>}
                        {schemaError.writeFunction !== undefined && (
                            <Alert variant="danger"> Error: {schemaError.writeFunction}. </Alert>
                        )}
                        {entryPointTemplateWriteFunction && (
                            <>
                                <br />
                                <br />
                                <div className="actionResultBox">
                                    Parameter Template:
                                    <pre>
                                        {JSON.stringify(JSON.parse(entryPointTemplateWriteFunction), undefined, 2)}
                                    </pre>
                                </div>
                            </>
                        )}
                        <br />
                        <Form.Group className="mb-3">
                            <Form.Label>Select input parameter type:</Form.Label>
                            <Select
                                options={INPUT_PARAMETER_TYPES_OPTIONS}
                                {...writeForm.register('inputParameterType')}
                                onChange={(e) => {
                                    writeForm.setValue('inputParameterType', e?.value);
                                    writeForm.setValue('inputParameter', undefined);

                                    setParsingErrorWrite(undefined);
                                }}
                            />
                            <Form.Text />
                        </Form.Group>

                        {(inputParameterType === 'number' || inputParameterType === 'string') && (
                            <Form.Group className="mb-3">
                                <Form.Label> Add your input parameter ({inputParameterType}):</Form.Label>
                                <Form.Control
                                    placeholder={inputParameterType === 'string' ? 'myString' : '1000000'}
                                    {...writeForm.register('inputParameter', { required: true })}
                                    onChange={(e) => {
                                        const inputParameterRegister = writeForm.register('inputParameter', {
                                            required: true,
                                        });

                                        inputParameterRegister.onChange(e);

                                        setParsingErrorWrite(undefined);
                                    }}
                                />
                                {writeForm.formState.errors.inputParameter && (
                                    <Alert variant="info"> Input parameter is required </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>
                        )}

                        {(inputParameterType === 'object' || inputParameterType === 'array') && (
                            <Form.Group className="mb-3">
                                <Form.Label> Add your input parameter ({inputParameterType}):</Form.Label>

                                {inputParameterType === 'array' && (
                                    <textarea
                                        {...writeForm.register('inputParameter')}
                                        onChange={(event) => {
                                            setParsingErrorWrite(undefined);
                                            const target = event.target as HTMLTextAreaElement;

                                            try {
                                                JSON.parse(target.value);
                                            } catch (e) {
                                                setParsingErrorWrite((e as Error).message);
                                                return;
                                            }
                                            writeForm.setValue('inputParameter', target.value);
                                        }}
                                    >
                                        {getArrayExample(entryPointTemplateWriteFunction)}
                                    </textarea>
                                )}
                                {inputParameterType === 'object' && (
                                    <textarea
                                        {...writeForm.register('inputParameter')}
                                        onChange={(event) => {
                                            setParsingErrorWrite(undefined);
                                            const target = event.target as HTMLTextAreaElement;

                                            try {
                                                JSON.parse(target.value);
                                            } catch (e) {
                                                setParsingErrorWrite((e as Error).message);
                                                return;
                                            }
                                            writeForm.setValue('inputParameter', target.value);
                                        }}
                                    >
                                        {getObjectExample(entryPointTemplateWriteFunction)}
                                    </textarea>
                                )}

                                {writeForm.formState.errors.inputParameter && (
                                    <Alert variant="info"> Input parameter is required </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>
                        )}

                        {parsingErrorWrite !== undefined && (
                            <Alert variant="danger"> Error: {parsingErrorWrite}. </Alert>
                        )}
                    </div>
                )}

                <br />

                <Button
                    variant="primary"
                    type="button"
                    onClick={writeForm.handleSubmit((data) => {
                        setTxHashUpdate(undefined);
                        setTransactionErrorUpdate(undefined);
                        setWriteTransactionOutcome(undefined);

                        const schema = deriveContractInfo
                            ? embeddedModuleSchemaBase64Write
                            : uploadedModuleSchemaBase64Write;

                        const tx = write(
                            connection,
                            account,
                            data.inputParameter,
                            data.smartContractName,
                            data.entryPointName,
                            data.hasInputParameter,
                            data.deriveFromSmartContractIndex,
                            schema,
                            data.inputParameterType,
                            BigInt(data.maxExecutionEnergy),
                            BigInt(data.smartContractIndex),
                            data.cCDAmount ? BigInt(data.cCDAmount) : BigInt(0)
                        );

                        tx.then(setTxHashUpdate).catch((err: Error) =>
                            setTransactionErrorUpdate((err as Error).message)
                        );
                    })}
                >
                    Write Smart Contract
                </Button>
                <br />
                <br />
                {shouldWarnInputParameterInSchemaIgnored.writeFunction && (
                    <div className="alert alert-warning" role="alert">
                        Warning: Input parameter schema found but &quot;Has Input Parameter&quot; checkbox is unchecked.
                    </div>
                )}
                {!txHashUpdate && transactionErrorUpdate && (
                    <div className="alert alert-danger" role="alert">
                        Error: {transactionErrorUpdate}.
                    </div>
                )}
                {txHashUpdate && (
                    <TxHashLink
                        txHash={txHashUpdate}
                        isTestnet={isTestnet}
                        message="The outcome of the transaction will be displayed below."
                    />
                )}
                {writeTransactionOutcome === 'Success' && (
                    <>
                        <br />
                        <div className="actionResultBox">
                            Outcome of transaction:
                            <div>{writeTransactionOutcome}</div>
                        </div>
                    </>
                )}
                {writeTransactionOutcome !== undefined && writeTransactionOutcome !== 'Success' && (
                    <>
                        <br />
                        <div> Outcome of transaction:</div>
                        <br />
                        <div className="alert alert-danger" role="alert">
                            Error: {writeTransactionOutcome}.
                        </div>
                    </>
                )}
            </Form>
        </Box>
    );
}
