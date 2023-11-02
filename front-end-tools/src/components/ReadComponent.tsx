/* eslint-disable no-console */
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import Select from 'react-select';
import { Alert, Button, Form, Row } from 'react-bootstrap';

import { WalletConnection } from '@concordium/react-components';
import {
    ModuleReference,
    displayTypeSchemaTemplate,
    toBuffer,
    getUpdateContractParameterSchema,
    ConcordiumGRPCClient,
} from '@concordium/web-sdk';

import Box from './Box';
import { read, getEmbeddedSchema, getContractInfo } from '../reading_from_blockchain';
import { getObjectExample, getArrayExample } from '../utils';
import { INPUT_PARAMETER_TYPES_OPTIONS } from '../constants';

interface ConnectionProps {
    account: string;
    connection: WalletConnection;
    client: ConcordiumGRPCClient | undefined;
}

export default function ReadComponenet(props: ConnectionProps) {
    const { client } = props;

    const readForm = useForm<{
        smartContractIndex: number;
        smartContractName: string | undefined;
        entryPointName: string | undefined;
        file: FileList | undefined;
        hasInputParameter: boolean;
        deriveFromSmartContractIndex: boolean;
        inputParameterType: string | undefined;
        inputParameter: string | undefined;
    }>();
    const deriveContractInfo = readForm.watch('deriveFromSmartContractIndex');
    const hasInputParameter = readForm.watch('hasInputParameter');
    const entryPointName = readForm.watch('entryPointName');
    const smartContractName = readForm.watch('smartContractName');
    const inputParameterType = readForm.watch('inputParameterType');

    const [schemaError, setSchemaError] = useState<string | undefined>(undefined);

    const [shouldWarnInputParameterInSchemaIgnored, setShouldWarnInputParameterInSchemaIgnored] =
        useState<boolean>(false);
    const [uploadErrorRead, setUploadErrorRead] = useState<string | undefined>(undefined);
    const [parsingErrorRead, setParsingErrorRead] = useState<string | undefined>(undefined);

    const [uploadedModuleSchemaBase64Read, setUploadedModuleSchemaBase64Read] = useState<string | undefined>(undefined);

    const [contractInstanceInfo, setContractInstanceInfo] = useState<
        { contractName: string; methods: string[]; sourceModule: ModuleReference } | undefined
    >(undefined);
    const [returnValue, setReturnValue] = useState<string | undefined>(undefined);
    const [readError, setReadError] = useState<string | undefined>(undefined);

    const [entryPointTemplateReadFunction, setEntryPointTemplateReadFunction] = useState<string | undefined>(undefined);

    const [embeddedModuleSchemaBase64Read, setEmbeddedModuleSchemaBase64Read] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (entryPointTemplateReadFunction !== undefined && readForm.getValues('hasInputParameter') === false) {
            setShouldWarnInputParameterInSchemaIgnored(true);
        } else {
            setShouldWarnInputParameterInSchemaIgnored(false);
        }
    }, [entryPointTemplateReadFunction, hasInputParameter]);

    useEffect(() => {
        setSchemaError(undefined);
        setEntryPointTemplateReadFunction(undefined);

        let receiveTemplateReadFunction;

        try {
            if (entryPointName === undefined) {
                throw new Error('Set entry point name');
            }

            if (smartContractName === undefined) {
                throw new Error('Set smart contract name');
            }

            let schema = '';

            const schemaFromModule = deriveContractInfo
                ? embeddedModuleSchemaBase64Read
                : uploadedModuleSchemaBase64Read;

            if (schemaFromModule !== undefined) {
                schema = schemaFromModule;
            }

            const readFunctionTemplate = getUpdateContractParameterSchema(
                toBuffer(schema, 'base64'),
                smartContractName,
                entryPointName
            );

            receiveTemplateReadFunction = displayTypeSchemaTemplate(readFunctionTemplate);

            setEntryPointTemplateReadFunction(receiveTemplateReadFunction);
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

        if (receiveTemplateReadFunction) {
            if (inputParameterType === 'array') {
                readForm.setValue(
                    'inputParameter',
                    JSON.stringify(JSON.parse(receiveTemplateReadFunction), undefined, 2)
                );
            } else if (inputParameterType === 'object') {
                readForm.setValue(
                    'inputParameter',
                    JSON.stringify(JSON.parse(receiveTemplateReadFunction), undefined, 2)
                );
            }
        }
    }, [entryPointName, hasInputParameter, smartContractName, uploadedModuleSchemaBase64Read, inputParameterType]);

    return (
        <Box header="Read From Smart Contract">
            <Form>
                <Row>
                    <Form.Group className="col-md-4 mb-3">
                        <Form.Label>Smart Contract Index</Form.Label>
                        <Form.Control
                            defaultValue={1999}
                            type="number"
                            min="0"
                            {...readForm.register('smartContractIndex', { required: true })}
                        />
                        <Form.Text />
                        {readForm.formState.errors.smartContractIndex && (
                            <Alert key="info" variant="info">
                                {' '}
                                Smart contract index is required{' '}
                            </Alert>
                        )}
                    </Form.Group>

                    {deriveContractInfo &&
                    contractInstanceInfo !== undefined &&
                    contractInstanceInfo.contractName !== undefined ? (
                        <Form.Group className="col-md-4 mb-3">
                            <Form.Label>Smart Contract Name</Form.Label>
                            <Form.Control
                                value={
                                    contractInstanceInfo?.contractName ? contractInstanceInfo.contractName : 'undefined'
                                }
                                disabled
                                {...readForm.register('smartContractName', { required: true })}
                            />
                            {readForm.formState.errors.smartContractName && (
                                <Alert key="info" variant="info">
                                    {' '}
                                    Smart contract name is required{' '}
                                </Alert>
                            )}
                            <Form.Text />
                        </Form.Group>
                    ) : (
                        <Form.Group className="col-md-4 mb-3">
                            <Form.Label>Smart Contract Name</Form.Label>
                            <Form.Control {...readForm.register('smartContractName', { required: true })} />
                            {readForm.formState.errors.smartContractName && (
                                <Alert key="info" variant="info">
                                    {' '}
                                    Smart contract name is required{' '}
                                </Alert>
                            )}
                            <Form.Text />
                        </Form.Group>
                    )}

                    {deriveContractInfo &&
                    contractInstanceInfo !== undefined &&
                    contractInstanceInfo.methods.length > 0 ? (
                        <Form.Group className="col-md-4 mb-3">
                            <Form.Label>Entry Point Name</Form.Label>
                            <Select
                                options={contractInstanceInfo.methods?.map((method) => ({
                                    value: method,
                                    label: method,
                                }))}
                                onChange={(e) => {
                                    readForm.setValue('entryPointName', e?.value);
                                }}
                            />
                            <Form.Text />
                        </Form.Group>
                    ) : (
                        <Form.Group className="col-md-4 mb-3">
                            <Form.Label>Entry Point Name</Form.Label>
                            <Form.Control {...readForm.register('entryPointName', { required: true })} />
                            {readForm.formState.errors.entryPointName && (
                                <Alert key="info" variant="info">
                                    {' '}
                                    Entry point name is required{' '}
                                </Alert>
                            )}
                            <Form.Text />
                        </Form.Group>
                    )}
                </Row>

                <div className="row d-flex justify-content-center">
                    <Form.Group className="mb-3 d-flex justify-content-center">
                        <Form.Check
                            type="checkbox"
                            id="deriveContractInfo"
                            label="Derive From Smart Contract Index"
                            {...readForm.register('deriveFromSmartContractIndex')}
                            onChange={async (e) => {
                                const deriveFromSmartContractIndexRegister =
                                    readForm.register('deriveFromSmartContractIndex');

                                deriveFromSmartContractIndexRegister.onChange(e);

                                setUploadedModuleSchemaBase64Read(undefined);
                                setSchemaError(undefined);
                                readForm.setValue('entryPointName', undefined);
                                setContractInstanceInfo(undefined);
                                setReadError(undefined);
                                setEmbeddedModuleSchemaBase64Read(undefined);

                                const checkboxElement = readForm.getValues('deriveFromSmartContractIndex');

                                if (checkboxElement) {
                                    const promiseContractInfo = getContractInfo(
                                        client,
                                        BigInt(readForm.getValues('smartContractIndex'))
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

                                                    setEmbeddedModuleSchemaBase64Read(moduleSchemaBase64Embedded);
                                                    setContractInstanceInfo(contractInfo);
                                                    readForm.setValue('smartContractName', contractInfo.contractName);
                                                })
                                                .catch((err: Error) => {
                                                    setReadError((err as Error).message);
                                                });
                                        })
                                        .catch((err: Error) => setReadError((err as Error).message));
                                }
                            }}
                        />
                    </Form.Group>
                </div>

                {!deriveContractInfo && (
                    <Form.Group className="mb-3">
                        <Form.Label>Upload Smart Contract Module Schema File (e.g. schema.bin)</Form.Label>
                        <Form.Control
                            type="file"
                            accept=".bin"
                            {...readForm.register('file')}
                            onChange={async (e) => {
                                const fileRegister = readForm.register('file');

                                fileRegister.onChange(e);

                                setUploadErrorRead(undefined);
                                setUploadedModuleSchemaBase64Read(undefined);

                                const files = readForm.getValues('file');

                                if (files !== undefined && files !== null && files.length > 0) {
                                    const file = files[0];
                                    const arrayBuffer = await file.arrayBuffer();

                                    const schema = btoa(
                                        new Uint8Array(arrayBuffer).reduce((data, byte) => {
                                            return data + String.fromCharCode(byte);
                                        }, '')
                                    );
                                    setUploadedModuleSchemaBase64Read(schema);
                                } else {
                                    setUploadErrorRead('Upload schema file is undefined');
                                }
                            }}
                        />
                        <Form.Text />
                    </Form.Group>
                )}
                {deriveContractInfo && (
                    <>
                        <br />
                        <Alert variant="info">
                            <div>
                                This checkbox autofilled the <code>smart contract name</code>, the{' '}
                                <code>entry point name</code>, and the{' '}
                                <code>receive return_value/parameter schema</code> from the smart contract index.
                            </div>
                            <br />
                            <div>
                                <b>Uncheck</b> this box, if you want to manually fill in a{' '}
                                <code>smart contract name</code>, an <code>entry point name</code>, or a{' '}
                                <code>receive return_value/parameter schema</code>.
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
                        id="hasInputParameter"
                        label="Has Input Parameter"
                        {...readForm.register('hasInputParameter')}
                        onChange={async (e) => {
                            const hasInputParameterRegister = readForm.register('hasInputParameter');

                            hasInputParameterRegister.onChange(e);

                            setParsingErrorRead(undefined);
                            readForm.setValue('inputParameterType', undefined);
                            readForm.setValue('inputParameter', undefined);
                            setEntryPointTemplateReadFunction(undefined);
                            setSchemaError(undefined);
                        }}
                    />
                </Form.Group>

                {hasInputParameter && (
                    <div className="box">
                        {!deriveContractInfo && uploadedModuleSchemaBase64Read && (
                            <div className="actionResultBox">
                                Schema in base64:
                                <div>{uploadedModuleSchemaBase64Read.toString().slice(0, 30)} ...</div>
                            </div>
                        )}
                        {uploadErrorRead !== undefined && <Alert variant="danger"> Error: {uploadErrorRead}. </Alert>}
                        {schemaError !== undefined && <Alert variant="danger"> Error: {schemaError}. </Alert>}
                        {entryPointTemplateReadFunction && (
                            <>
                                <br />
                                <br />
                                <div className="actionResultBox">
                                    Parameter Template:
                                    <pre>
                                        {JSON.stringify(JSON.parse(entryPointTemplateReadFunction), undefined, 2)}
                                    </pre>
                                </div>
                            </>
                        )}
                        <br />
                        <Form.Group className="mb-3">
                            <Form.Label>Select input parameter type:</Form.Label>
                            <Select
                                options={INPUT_PARAMETER_TYPES_OPTIONS}
                                {...readForm.register('inputParameterType')}
                                onChange={(e) => {
                                    readForm.setValue('inputParameterType', e?.value);
                                    readForm.setValue('inputParameter', undefined);

                                    setParsingErrorRead(undefined);
                                }}
                            />
                            <Form.Text />
                        </Form.Group>

                        {(inputParameterType === 'number' || inputParameterType === 'string') && (
                            <Form.Group className="mb-3">
                                <Form.Label> Add your input parameter ({inputParameterType}):</Form.Label>
                                <Form.Control
                                    placeholder={inputParameterType === 'string' ? 'myString' : '1000000'}
                                    {...readForm.register('inputParameter', { required: true })}
                                    onChange={(e) => {
                                        const inputParameterRegister = readForm.register('inputParameter', {
                                            required: true,
                                        });

                                        inputParameterRegister.onChange(e);

                                        setParsingErrorRead(undefined);
                                    }}
                                />
                                {readForm.formState.errors.inputParameter && (
                                    <Alert key="info" variant="info">
                                        {' '}
                                        Input parameter is required{' '}
                                    </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>
                        )}

                        {(inputParameterType === 'object' || inputParameterType === 'array') && (
                            <Form.Group className="mb-3">
                                <Form.Label> Add your input parameter ({inputParameterType}):</Form.Label>

                                {inputParameterType === 'array' && (
                                    <textarea
                                        {...readForm.register('inputParameter')}
                                        onChange={(event) => {
                                            setParsingErrorRead(undefined);
                                            const target = event.target as HTMLTextAreaElement;

                                            try {
                                                JSON.parse(target.value);
                                            } catch (e) {
                                                setParsingErrorRead((e as Error).message);
                                                return;
                                            }
                                            readForm.setValue('inputParameter', target.value);
                                        }}
                                    >
                                        {getArrayExample(entryPointTemplateReadFunction)}
                                    </textarea>
                                )}
                                {inputParameterType === 'object' && (
                                    <textarea
                                        {...readForm.register('inputParameter')}
                                        onChange={(event) => {
                                            setParsingErrorRead(undefined);
                                            const target = event.target as HTMLTextAreaElement;

                                            try {
                                                JSON.parse(target.value);
                                            } catch (e) {
                                                setParsingErrorRead((e as Error).message);
                                                return;
                                            }
                                            readForm.setValue('inputParameter', target.value);
                                        }}
                                    >
                                        {getObjectExample(entryPointTemplateReadFunction)}
                                    </textarea>
                                )}

                                {readForm.formState.errors.inputParameter && (
                                    <Alert key="info" variant="info">
                                        {' '}
                                        Input parameter is required{' '}
                                    </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>
                        )}

                        {parsingErrorRead !== undefined && <Alert variant="danger"> Error: {parsingErrorRead}. </Alert>}
                    </div>
                )}

                <br />

                <Button
                    variant="primary"
                    type="button"
                    onClick={readForm.handleSubmit((data) => {
                        setReadError(undefined);
                        setReturnValue(undefined);

                        const schema = data.deriveFromSmartContractIndex
                            ? embeddedModuleSchemaBase64Read
                            : uploadedModuleSchemaBase64Read;

                        const promise = read(
                            client,
                            data.smartContractName,
                            BigInt(data.smartContractIndex),
                            data.entryPointName,
                            schema,
                            data.inputParameter,
                            data.inputParameterType,
                            data.hasInputParameter,
                            data.deriveFromSmartContractIndex
                        );

                        promise
                            .then((value) => {
                                setReturnValue(value);
                            })
                            .catch((err: Error) => setReadError((err as Error).message));
                    })}
                >
                    Read Smart Contract
                </Button>
                <br />
                <br />
                {(deriveContractInfo ? embeddedModuleSchemaBase64Read : uploadedModuleSchemaBase64Read) ===
                    undefined && (
                    <Alert variant="warning">
                        {' '}
                        Warning: ModuleSchema is undefined. Return value might not be correctly decoded.{' '}
                    </Alert>
                )}
                {shouldWarnInputParameterInSchemaIgnored && (
                    <Alert variant="warning">
                        {' '}
                        Warning: Input parameter schema found but &quot;Has Input Parameter&quot; checkbox is unchecked.{' '}
                    </Alert>
                )}
                {readError && <Alert variant="danger"> Error: {readError}. </Alert>}
                {returnValue && (
                    <div className="actionResultBox">
                        Read value:
                        <pre>{JSON.stringify(JSON.parse(returnValue), undefined, 2)}</pre>
                    </div>
                )}
            </Form>
        </Box>
    );
}
