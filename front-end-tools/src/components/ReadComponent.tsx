import React, { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import Select from 'react-select';
import { Alert, Button, Form, Row } from 'react-bootstrap';

import { WalletConnection } from '@concordium/react-components';
import {
    ModuleReference,
    displayTypeSchemaTemplate,
    toBuffer,
    getUpdateContractParameterSchema,
    ConcordiumGRPCClient,
    ContractName,
    EntrypointName,
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

/**
 * A component that manages the input fields and corresponding state to read from a smart contract instance on the chain.
 * The `invoke` action is used in this component which does not create a transaction.
 */
export default function ReadComponenet(props: ConnectionProps) {
    const { client } = props;

    type FormType = {
        smartContractIndex: number;
        smartContractName: string;
        entryPointName: string | undefined;
        file: FileList | undefined;
        hasInputParameter: boolean;
        deriveFromSmartContractIndex: boolean;
        inputParameterType: string | undefined;
        inputParameter: string | undefined;
    };

    const form = useForm<FormType>({ mode: 'all' });

    const [deriveContractInfo, smartContractName, inputParameterType, entryPointName, hasInputParameter] = useWatch({
        control: form.control,
        name: [
            'deriveFromSmartContractIndex',
            'smartContractName',
            'inputParameterType',
            'entryPointName',
            'hasInputParameter',
        ],
    });

    const [schemaError, setSchemaError] = useState<string | undefined>(undefined);

    const [uploadError, setUploadError] = useState<string | undefined>(undefined);
    const [parsingError, setParsingError] = useState<string | undefined>(undefined);

    const [uploadedModuleSchemaBase64, setUploadedModuleSchemaBase64] = useState<string | undefined>(undefined);

    const [contractInstanceInfo, setContractInstanceInfo] = useState<
        | { contractName: ContractName.Type; methods: EntrypointName.Type[]; sourceModule: ModuleReference.Type }
        | undefined
    >(undefined);
    const [returnValue, setReturnValue] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | undefined>(undefined);

    const [entryPointTemplate, setEntryPointTemplate] = useState<string | undefined>(undefined);

    const [embeddedModuleSchemaBase64, setEmbeddedModuleSchemaBase64] = useState<string | undefined>(undefined);

    const shouldWarnInputParameterInSchemaIgnored = useMemo(() => {
        if (entryPointTemplate !== undefined && form.getValues('hasInputParameter') === false) {
            return true;
        }
        return false;
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

            const schema = deriveContractInfo ? embeddedModuleSchemaBase64 : uploadedModuleSchemaBase64;
            if (schema === undefined) {
                setSchemaError('Schema was not uploaded');
                return;
            }

            const readFunctionTemplate = getUpdateContractParameterSchema(
                toBuffer(schema, 'base64'),
                ContractName.fromString(smartContractName),
                EntrypointName.fromString(entryPointName)
            );

            receiveTemplate = displayTypeSchemaTemplate(readFunctionTemplate);

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
        setError(undefined);
        setReturnValue(undefined);

        const schema = data.deriveFromSmartContractIndex ? embeddedModuleSchemaBase64 : uploadedModuleSchemaBase64;

        // Invoke smart contract (read)

        const promise = read(
            client,
            ContractName.fromString(data.smartContractName),
            BigInt(data.smartContractIndex),
            data.entryPointName ? EntrypointName.fromString(data.entryPointName) : undefined,
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
            .catch((err: Error) => setError((err as Error).message));
    }

    return (
        <Box header="Read From Smart Contract">
            <Form onSubmit={form.handleSubmit(onSubmit)}>
                <Row>
                    <Form.Group className="col-md-4 mb-3">
                        <Form.Label>Smart Contract Index</Form.Label>
                        <Form.Control
                            defaultValue={1999}
                            type="number"
                            min="0"
                            {...form.register('smartContractIndex', { required: true })}
                        />
                        <Form.Text />
                        {form.formState.errors.smartContractIndex && (
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
                                    contractInstanceInfo?.contractName
                                        ? ContractName.toString(contractInstanceInfo.contractName)
                                        : 'undefined'
                                }
                                disabled
                                {...form.register('smartContractName', { required: true })}
                            />
                            {form.formState.errors.smartContractName && (
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
                            <Form.Control {...form.register('smartContractName', { required: true })} />
                            {form.formState.errors.smartContractName && (
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
                                {...form.register('entryPointName', { required: true })}
                                options={contractInstanceInfo.methods?.map(EntrypointName.toString).map((method) => ({
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
                        <Form.Group className="col-md-4 mb-3">
                            <Form.Label>Entry Point Name</Form.Label>
                            <Form.Control {...form.register('entryPointName', { required: true })} />
                            {form.formState.errors.entryPointName && (
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

                                                    // Use `reduce` to be able to convert large modules.
                                                    const moduleSchemaBase64Embedded = btoa(
                                                        new Uint8Array(schema).reduce(
                                                            (data, byte) => data + String.fromCharCode(byte),
                                                            ''
                                                        )
                                                    );

                                                    setEmbeddedModuleSchemaBase64(moduleSchemaBase64Embedded);
                                                    setContractInstanceInfo(contractInfo);
                                                    form.setValue(
                                                        'smartContractName',
                                                        ContractName.toString(contractInfo.contractName)
                                                    );
                                                })
                                                .catch((err: Error) => {
                                                    setContractInstanceInfo(contractInfo);
                                                    form.setValue(
                                                        'smartContractName',
                                                        ContractName.toString(contractInfo.contractName)
                                                    );
                                                    setError((err as Error).message);
                                                });
                                        })
                                        .catch((err: Error) => setError((err as Error).message));
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

                                    // Use `reduce` to be able to convert large schemas.
                                    const schema = btoa(
                                        new Uint8Array(arrayBuffer).reduce(
                                            (data, byte) => data + String.fromCharCode(byte),
                                            ''
                                        )
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
                        {!deriveContractInfo && uploadedModuleSchemaBase64 && (
                            <div className="actionResultBox">
                                Schema in base64:
                                <div>{uploadedModuleSchemaBase64.toString().slice(0, 30)} ...</div>
                            </div>
                        )}
                        {uploadError !== undefined && <Alert variant="danger"> Error: {uploadError}. </Alert>}
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
                                    <Alert key="info" variant="info">
                                        {' '}
                                        Input parameter is required{' '}
                                    </Alert>
                                )}
                                <Form.Text />
                            </Form.Group>
                        )}

                        {parsingError !== undefined && <Alert variant="danger"> Error: {parsingError}. </Alert>}
                    </div>
                )}

                <br />

                <Button variant="primary" type="submit">
                    Read Smart Contract
                </Button>
                <br />
                <br />
                {(deriveContractInfo ? embeddedModuleSchemaBase64 : uploadedModuleSchemaBase64) === undefined && (
                    <Alert variant="warning">
                        {' '}
                        Warning: There is no module schema, so the return value cannot be decoded.{' '}
                    </Alert>
                )}
                {shouldWarnInputParameterInSchemaIgnored && (
                    <Alert variant="warning">
                        {' '}
                        Warning: Input parameter schema found but &quot;Has Input Parameter&quot; checkbox is unchecked.{' '}
                    </Alert>
                )}
                {error && <Alert variant="danger"> Error: {error}. </Alert>}
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
