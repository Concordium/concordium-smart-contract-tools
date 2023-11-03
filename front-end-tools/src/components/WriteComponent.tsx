/* eslint-disable no-console */
import React, { useEffect, useState } from 'react';
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

import Box from './Box';
import { TxHashLink } from './CCDScanLinks';
import { write } from '../writing_to_blockchain';
import { getEmbeddedSchema, getContractInfo } from '../reading_from_blockchain';
import { getObjectExample, getArrayExample } from '../utils';
import { REFRESH_INTERVAL, INPUT_PARAMETER_TYPES_OPTIONS } from '../constants';

interface ConnectionProps {
    isTestnet: boolean;
    account: string;
    connection: WalletConnection;
    client: ConcordiumGRPCClient | undefined;
}

export default function WriteComponenet(props: ConnectionProps) {
    const { isTestnet, account, connection, client } = props;

    type FormType = {
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
    };

    const form = useForm<FormType>();
    const deriveContractInfo = form.watch('deriveFromSmartContractIndex');
    const hasInputParameter = form.watch('hasInputParameter');
    const entryPointName = form.watch('entryPointName');
    const smartContractName = form.watch('smartContractName');
    const inputParameterType = form.watch('inputParameterType');

    const isPayable = form.watch('isPayable');

    const [uploadError, setUploadError] = useState<string | undefined>(undefined);
    const [parsingError, setParsingError] = useState<string | undefined>(undefined);
    const [schemaError, setSchemaError] = useState<string | undefined>(undefined);

    const [shouldWarnInputParameterInSchemaIgnored, setShouldWarnInputParameterInSchemaIgnored] = useState(false);

    const [transactionErrorUpdate, setTransactionErrorUpdate] = useState<string | undefined>(undefined);
    const [txHashUpdate, setTxHashUpdate] = useState<string | undefined>(undefined);
    const [uploadedModuleSchemaBase64, setUploadedModuleSchemaBase64] = useState<string | undefined>(undefined);

    const [contractInstanceInfo, setContractInstanceInfo] = useState<
        { contractName: string; methods: string[]; sourceModule: ModuleReference } | undefined
    >(undefined);
    const [error, setError] = useState<string | undefined>(undefined);

    const [entryPointTemplate, setEntryPointTemplate] = useState<string | undefined>(undefined);

    const [transactionOutcome, setTransactionOutcome] = useState<string | undefined>(undefined);

    const [embeddedModuleSchemaBase64, setEmbeddedModuleSchemaBase64] = useState<string | undefined>(undefined);

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
                                    setTransactionOutcome('Success');
                                    clearInterval(interval);
                                } else {
                                    setTransactionOutcome('Fail');
                                    clearInterval(interval);
                                }
                            }
                        }
                    })
                    .catch((e) => {
                        setTransactionOutcome(`Fail; Error: ${(e as Error).message}`);
                        clearInterval(interval);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
        }
    }, [connection, account, client, txHashUpdate]);

    useEffect(() => {
        if (entryPointTemplate !== undefined && hasInputParameter === false) {
            setShouldWarnInputParameterInSchemaIgnored(true);
        } else {
            setShouldWarnInputParameterInSchemaIgnored(false);
        }
    }, [entryPointTemplate, hasInputParameter]);

    useEffect(() => {
        setSchemaError(undefined);
        setEntryPointTemplate(undefined);

        let receiveTemplate;

        try {
            if (entryPointName === undefined) {
                throw new Error('Set entry point name');
            }

            if (smartContractName === undefined) {
                throw new Error('Set smart contract name');
            }

            let schema = '';

            const schemaFromModule = deriveContractInfo ? embeddedModuleSchemaBase64 : uploadedModuleSchemaBase64;

            if (schemaFromModule !== undefined) {
                schema = schemaFromModule;
            }

            const functionTemplate = getUpdateContractParameterSchema(
                toBuffer(schema, 'base64'),
                smartContractName,
                entryPointName
            );

            receiveTemplate = displayTypeSchemaTemplate(functionTemplate);

            setEntryPointTemplate(receiveTemplate);
        } catch (e) {
            if (deriveContractInfo) {
                setSchemaError(
                    `Could not derive the embedded schema from the smart contract index. Uncheck "Derive From Smart Contract Index" checkbox to manually upload a schema or uncheck "Has Input Paramter" checkbox if this entrypoint has no input parameter. Original error: ${e}`
                );
            } else {
                setSchemaError(
                    `Could not get schema from uploaded schema. Uncheck "Has Input Paramter" checkbox if this entrypoint has no input parameter. Original error: ${e}`
                );
            }
        }

        if (receiveTemplate) {
            if (inputParameterType === 'array') {
                form.setValue('inputParameter', JSON.stringify(JSON.parse(receiveTemplate), undefined, 2));
            } else if (inputParameterType === 'object') {
                form.setValue('inputParameter', JSON.stringify(JSON.parse(receiveTemplate), undefined, 2));
            }
        }
    }, [entryPointName, hasInputParameter, smartContractName, uploadedModuleSchemaBase64, inputParameterType]);

    function onSubmit(data: FormType) {
        setTxHashUpdate(undefined);
        setTransactionErrorUpdate(undefined);
        setTransactionOutcome(undefined);

        const schema = deriveContractInfo ? embeddedModuleSchemaBase64 : uploadedModuleSchemaBase64;

        // Send update transaction

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

        tx.then(setTxHashUpdate).catch((err: Error) => setTransactionErrorUpdate((err as Error).message));
    }

    return (
        <Box header="Write To Smart Contract">
            <Form onSubmit={form.handleSubmit(onSubmit)}>
                <Row>
                    <Form.Group className="col-md-3 mb-3">
                        <Form.Label>Smart Contract Index</Form.Label>
                        <Form.Control
                            defaultValue={1999}
                            type="number"
                            min="0"
                            {...form.register('smartContractIndex', { required: true })}
                        />
                        <Form.Text />
                        {form.formState.errors.smartContractIndex && (
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
                                {...form.register('smartContractName', { required: true })}
                            />
                            {form.formState.errors.smartContractName && (
                                <Alert variant="info"> Smart contract name is required </Alert>
                            )}
                            <Form.Text />
                        </Form.Group>
                    ) : (
                        <Form.Group className="col-md-3 mb-3">
                            <Form.Label>Smart Contract Name</Form.Label>
                            <Form.Control {...form.register('smartContractName', { required: true })} />
                            {form.formState.errors.smartContractName && (
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
                                    form.setValue('entryPointName', e?.value);
                                }}
                            />
                            <Form.Text />
                        </Form.Group>
                    ) : (
                        <Form.Group className="col-md-3 mb-3">
                            <Form.Label>Entry Point Name</Form.Label>
                            <Form.Control {...form.register('entryPointName', { required: true })} />
                            {form.formState.errors.entryPointName && (
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
                            {...form.register('maxExecutionEnergy', { required: true })}
                        />
                        <Form.Text />
                        {form.formState.errors.maxExecutionEnergy && (
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
                            {...form.register('deriveFromSmartContractIndex')}
                            onChange={async (e) => {
                                const deriveFromSmartContractIndexRegister =
                                    form.register('deriveFromSmartContractIndex');

                                deriveFromSmartContractIndexRegister.onChange(e);

                                setUploadedModuleSchemaBase64(undefined);
                                setSchemaError(undefined);
                                form.setValue('entryPointName', undefined);
                                setContractInstanceInfo(undefined);
                                setError(undefined);
                                setEmbeddedModuleSchemaBase64(undefined);

                                const checkboxElement = form.getValues('deriveFromSmartContractIndex');

                                if (checkboxElement) {
                                    const promiseContractInfo = getContractInfo(
                                        client,
                                        BigInt(form.getValues('smartContractIndex'))
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

                                                    setEmbeddedModuleSchemaBase64(moduleSchemaBase64Embedded);
                                                    setContractInstanceInfo(contractInfo);
                                                    form.setValue('smartContractName', contractInfo.contractName);
                                                })
                                                .catch((err: Error) => {
                                                    setError((err as Error).message);
                                                });
                                        })
                                        .catch((err: Error) => setError((err as Error).message));
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
                        {...form.register('isPayable')}
                        onChange={async (e) => {
                            const isPayableRegister = form.register('isPayable');

                            isPayableRegister.onChange(e);

                            form.setValue('cCDAmount', 0);
                        }}
                    />
                </Form.Group>

                {isPayable && (
                    <>
                        <div className="box">
                            <Form.Group className="mb-3">
                                <Form.Label>CCD amount (micro):</Form.Label>
                                <Form.Control
                                    defaultValue={0}
                                    type="number"
                                    min="0"
                                    {...form.register('cCDAmount', { required: true })}
                                />
                                <Form.Text />
                                {form.formState.errors.cCDAmount && (
                                    <Alert variant="info"> cCDAmount is required </Alert>
                                )}
                            </Form.Group>
                        </div>
                        <br />
                    </>
                )}

                <Form.Group className="mb-3 d-flex justify-content-center">
                    <Form.Check
                        type="checkbox"
                        id="hasInputParameter"
                        label="Has Input Parameter"
                        {...form.register('hasInputParameter')}
                        onChange={async (e) => {
                            const hasInputParameterRegister = form.register('hasInputParameter');

                            hasInputParameterRegister.onChange(e);

                            setParsingError(undefined);
                            form.setValue('inputParameterType', undefined);
                            form.setValue('inputParameter', undefined);
                            setEntryPointTemplate(undefined);
                            setSchemaError(undefined);
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
                                    {...form.register('file')}
                                    onChange={async (e) => {
                                        const fileRegister = form.register('file');

                                        fileRegister.onChange(e);

                                        setUploadError(undefined);
                                        setUploadedModuleSchemaBase64(undefined);

                                        const files = form.getValues('file');

                                        if (files !== undefined && files !== null && files.length > 0) {
                                            const file = files[0];
                                            const arrayBuffer = await file.arrayBuffer();

                                            const schema = btoa(
                                                new Uint8Array(arrayBuffer).reduce((data, byte) => {
                                                    return data + String.fromCharCode(byte);
                                                }, '')
                                            );
                                            setUploadedModuleSchemaBase64(schema);
                                        } else {
                                            setUploadError('Upload schema file is undefined');
                                        }
                                    }}
                                />
                                <Form.Text />
                            </Form.Group>
                        )}

                        {!deriveContractInfo && uploadedModuleSchemaBase64 && (
                            <div className="actionResultBox">
                                Schema in base64:
                                <div>{uploadedModuleSchemaBase64.toString().slice(0, 30)} ...</div>
                            </div>
                        )}
                        {uploadError !== undefined && <Alert variant="danger"> Error: {uploadError}. </Alert>}
                        {error && <Alert variant="danger"> Error: {error}. </Alert>}
                        {schemaError !== undefined && <Alert variant="danger"> Error: {schemaError}. </Alert>}
                        {entryPointTemplate && (
                            <>
                                <br />
                                <br />
                                <div className="actionResultBox">
                                    Parameter Template:
                                    <pre>{JSON.stringify(JSON.parse(entryPointTemplate), undefined, 2)}</pre>
                                </div>
                            </>
                        )}
                        <br />
                        <Form.Group className="mb-3">
                            <Form.Label>Select input parameter type:</Form.Label>
                            <Select
                                options={INPUT_PARAMETER_TYPES_OPTIONS}
                                {...form.register('inputParameterType')}
                                onChange={(e) => {
                                    form.setValue('inputParameterType', e?.value);
                                    form.setValue('inputParameter', undefined);

                                    setParsingError(undefined);
                                }}
                            />
                            <Form.Text />
                        </Form.Group>

                        {(inputParameterType === 'number' || inputParameterType === 'string') && (
                            <Form.Group className="mb-3">
                                <Form.Label> Add your input parameter ({inputParameterType}):</Form.Label>
                                <Form.Control
                                    placeholder={inputParameterType === 'string' ? 'myString' : '1000000'}
                                    {...form.register('inputParameter', { required: true })}
                                    onChange={(e) => {
                                        const inputParameterRegister = form.register('inputParameter', {
                                            required: true,
                                        });

                                        inputParameterRegister.onChange(e);

                                        setParsingError(undefined);
                                    }}
                                />
                                {form.formState.errors.inputParameter && (
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
                                        {...form.register('inputParameter')}
                                        onChange={(event) => {
                                            setParsingError(undefined);
                                            const target = event.target as HTMLTextAreaElement;

                                            try {
                                                JSON.parse(target.value);
                                            } catch (e) {
                                                setParsingError((e as Error).message);
                                                return;
                                            }
                                            form.setValue('inputParameter', target.value);
                                        }}
                                    >
                                        {getArrayExample(entryPointTemplate)}
                                    </textarea>
                                )}
                                {inputParameterType === 'object' && (
                                    <textarea
                                        {...form.register('inputParameter')}
                                        onChange={(event) => {
                                            setParsingError(undefined);
                                            const target = event.target as HTMLTextAreaElement;

                                            try {
                                                JSON.parse(target.value);
                                            } catch (e) {
                                                setParsingError((e as Error).message);
                                                return;
                                            }
                                            form.setValue('inputParameter', target.value);
                                        }}
                                    >
                                        {getObjectExample(entryPointTemplate)}
                                    </textarea>
                                )}

                                {form.formState.errors.inputParameter && (
                                    <Alert variant="info"> Input parameter is required </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>
                        )}

                        {parsingError !== undefined && <Alert variant="danger"> Error: {parsingError}. </Alert>}
                    </div>
                )}

                <br />

                <Button variant="primary" type="submit">
                    Write Smart Contract
                </Button>
                <br />
                <br />
                {shouldWarnInputParameterInSchemaIgnored && (
                    <Alert variant="warning">
                        {' '}
                        Warning: Input parameter schema found but &quot;Has Input Parameter&quot; checkbox is unchecked.
                    </Alert>
                )}
                {!txHashUpdate && transactionErrorUpdate && (
                    <Alert variant="danger"> Error: {transactionErrorUpdate}. </Alert>
                )}
                {txHashUpdate && (
                    <TxHashLink
                        txHash={txHashUpdate}
                        isTestnet={isTestnet}
                        message="The outcome of the transaction will be displayed below."
                    />
                )}
                {transactionOutcome === 'Success' && (
                    <>
                        <br />
                        <div className="actionResultBox">
                            Outcome of transaction:
                            <div>{transactionOutcome}</div>
                        </div>
                    </>
                )}
                {transactionOutcome !== undefined && transactionOutcome !== 'Success' && (
                    <>
                        <br />
                        <div> Outcome of transaction:</div>
                        <br />
                        <Alert variant="danger"> Error: {transactionOutcome}. </Alert>
                    </>
                )}
            </Form>
        </Box>
    );
}
