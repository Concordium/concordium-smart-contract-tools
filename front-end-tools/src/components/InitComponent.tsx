import React, { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import Select from 'react-select';
import { Alert, Button, Form, Row } from 'react-bootstrap';

import { WalletConnection } from '@concordium/react-components';
import {
    ModuleReference,
    TransactionKindString,
    TransactionSummaryType,
    displayTypeSchemaTemplate,
    toBuffer,
    ConcordiumGRPCClient,
    getInitContractParameterSchema,
    TransactionHash,
    ContractName,
    AccountAddress,
    Energy,
    CcdAmount,
} from '@concordium/web-sdk';

import { TxHashLink } from './CCDScanLinks';
import Box from './Box';
import { initialize } from '../writing_to_blockchain';
import { getObjectExample, getArrayExample } from '../utils';
import { REFRESH_INTERVAL, INPUT_PARAMETER_TYPES_OPTIONS, hexRegex, MODULE_REFERENCE_PLACEHOLDER } from '../constants';
import { getModuleSource } from '../reading_from_blockchain';

interface ConnectionProps {
    account: string;
    client: ConcordiumGRPCClient | undefined;
    connection: WalletConnection;
    contracts: string[];
    embeddedModuleSchemaBase64FromStep1: undefined | string;
    isTestnet: boolean;
    moduleReferenceCalculated: undefined | ModuleReference.Type;
    moduleReferenceDeployed: undefined | ModuleReference.Type;
}

/**
 * A component that manages the input fields and corresponding state to initialize a new smart contract instance on chain.
 * This components creates an `InitContract` transaction.
 */
export default function InitComponent(props: ConnectionProps) {
    const {
        account,
        client,
        connection,
        contracts,
        embeddedModuleSchemaBase64FromStep1,
        isTestnet,
        moduleReferenceCalculated,
        moduleReferenceDeployed,
    } = props;

    type FormType = {
        cCDAmount: number;
        deriveFromModuleRefernce: string | undefined;
        file: FileList | undefined;
        hasInputParameter: boolean;
        inputParameter: string | undefined;
        inputParameterType: string | undefined;
        isPayable: boolean;
        maxExecutionEnergy: number;
        moduleReferenceString: string | undefined;
        smartContractName: string | undefined;
    };

    const form = useForm<FormType>({ mode: 'all' });

    const [deriveFromModuleRefernce, hasInputParameter, inputParameterType, isPayable, smartContractName, file] =
        useWatch({
            control: form.control,
            name: [
                'deriveFromModuleRefernce',
                'hasInputParameter',
                'inputParameterType',
                'isPayable',
                'smartContractName',
                'file',
            ],
        });

    const [transactionError, setTransactionError] = useState<string | undefined>(undefined);

    const [uploadError2, setUploadError2] = useState<string | undefined>(undefined);
    const [parsingError, setParsingError] = useState<string | undefined>(undefined);
    const [smartContractIndexError, setSmartContractIndexError] = useState<string | undefined>(undefined);
    const [moduleReferenceError, setModuleReferenceError] = useState<string | undefined>(undefined);
    const [moduleReferenceLengthError, setModuleReferenceLengthError] = useState<string | undefined>(undefined);
    const [schemaError, setSchemaError] = useState<string | undefined>(undefined);

    const [isModuleReferenceAlreadyDeployedStep2, setIsModuleReferenceAlreadyDeployedStep2] = useState(false);

    const [txHash, setTxHash] = useState<string | undefined>(undefined);

    const [schema, setSchema] = useState<string | undefined>(undefined);
    const [moduleReference, setModuleReference] = useState<ModuleReference.Type | undefined>(
        ModuleReference.fromHexString(MODULE_REFERENCE_PLACEHOLDER)
    );

    const [smartContractIndex, setSmartContractIndex] = useState<string | undefined>(undefined);
    const [inputParameterTemplate, setInputParameterTemplate] = useState<string | undefined>(undefined);
    const [displayContracts, setDisplayContracts] = useState<string[]>([]);

    // Refresh smartContractIndex periodically.
    // eslint-disable-next-line consistent-return
    useEffect(() => {
        if (connection && client && txHash !== undefined) {
            const interval = setInterval(() => {
                client
                    .getBlockItemStatus(TransactionHash.fromHexString(txHash))
                    .then((report) => {
                        if (report !== undefined) {
                            setSmartContractIndex(undefined);
                            if (report.status === 'finalized') {
                                if (
                                    report.outcome.summary.type === TransactionSummaryType.AccountTransaction &&
                                    report.outcome.summary.transactionType === TransactionKindString.InitContract
                                ) {
                                    setSmartContractIndex(
                                        report.outcome.summary.contractInitialized.address.index.toString()
                                    );
                                    clearInterval(interval);
                                } else {
                                    setSmartContractIndexError('Contract initialization failed');
                                    clearInterval(interval);
                                }
                            }
                        }
                    })
                    .catch((e) => {
                        setSmartContractIndex(undefined);
                        setSmartContractIndexError((e as Error).message);
                        clearInterval(interval);
                    });
            }, REFRESH_INTERVAL.asMilliseconds());
            return () => clearInterval(interval);
        }
    }, [connection, client, txHash]);

    useEffect(() => {
        if (connection && client && moduleReference) {
            client
                .getModuleSource(moduleReference)
                .then((value) => {
                    if (value === undefined) {
                        setIsModuleReferenceAlreadyDeployedStep2(false);
                    } else {
                        setIsModuleReferenceAlreadyDeployedStep2(true);
                    }
                })
                .catch(() => {
                    setIsModuleReferenceAlreadyDeployedStep2(false);
                });
        }
    }, [connection, client, moduleReference]);

    const shouldWarnDifferenceModuleReferences = useMemo(() => {
        if (
            moduleReference !== undefined &&
            moduleReferenceCalculated !== undefined &&
            moduleReferenceCalculated !== moduleReference
        ) {
            return true;
        }
        return false;
    }, [moduleReference, moduleReferenceCalculated]);

    const shouldWarnInputParameterInSchemaIgnored = useMemo(() => {
        if (inputParameterTemplate !== undefined && hasInputParameter === false) {
            return true;
        }
        return false;
    }, [inputParameterTemplate, hasInputParameter]);

    useEffect(() => {
        setSchemaError(undefined);
        setInputParameterTemplate(undefined);

        let initTemplate;

        try {
            if (smartContractName === undefined) {
                throw new Error('Set smart contract name');
            }

            const inputParamterTypeSchemaBuffer = getInitContractParameterSchema(
                toBuffer(schema || '', 'base64'),
                ContractName.fromString(smartContractName),
                2
            );

            initTemplate = displayTypeSchemaTemplate(inputParamterTypeSchemaBuffer);

            setInputParameterTemplate(initTemplate);
        } catch (e) {
            if (deriveFromModuleRefernce === "Don't derive") {
                setSchemaError(
                    `Could not get schema from uploaded schema. Uncheck "Has Input Paramter" checkbox if this entrypoint has no input parameter. Original error: ${e}`
                );
            } else {
                setSchemaError(
                    `Could not get embedded schema from the module. Select "Don't derive" to manually upload a schema or uncheck "Has Input Paramter" checkbox if this entrypoint has no input parameter. Original error: ${e}`
                );
            }
        }

        if (initTemplate) {
            if (inputParameterType === 'array') {
                form.setValue('inputParameter', JSON.stringify(JSON.parse(initTemplate), undefined, 2));
            } else if (inputParameterType === 'object') {
                form.setValue('inputParameter', JSON.stringify(JSON.parse(initTemplate), undefined, 2));
            }
        }
    }, [hasInputParameter, smartContractName, schema, inputParameterType]);

    const validateModuleReference = (value: string | undefined) => {
        if (!value) {
            return true;
        }

        try {
            if (!hexRegex.test(value)) {
                return 'Invalid module reference. Not a hex string.';
            }

            setModuleReference(ModuleReference.fromHexString(value));

            return true;
        } catch (e) {
            return `Invalid module reference. Original error: ${(e as Error).message}`;
        }
    };

    function onSubmit(data: FormType) {
        setTxHash(undefined);
        setSmartContractIndexError(undefined);
        setSmartContractIndex(undefined);
        setTransactionError(undefined);

        // Send init transaction
        const tx = initialize(
            connection,
            AccountAddress.fromBase58(account),
            isModuleReferenceAlreadyDeployedStep2,
            moduleReference,
            data.inputParameter,
            data.smartContractName ? ContractName.fromString(data.smartContractName) : undefined,
            data.hasInputParameter,
            data.deriveFromModuleRefernce,
            schema,
            data.inputParameterType,
            Energy.create(data.maxExecutionEnergy),
            CcdAmount.fromMicroCcd(data.cCDAmount ?? 0)
        );
        tx.then(setTxHash).catch((err: Error) => setTransactionError((err as Error).message));
    }

    return (
        <Box header="Step 2: Initialize Smart Contract">
            <Form onSubmit={form.handleSubmit(onSubmit)}>
                <Form.Group className="justify-content-center">
                    <Form.Label>DeriveFromModuleRefernce</Form.Label>
                    <Select
                        {...form.register('deriveFromModuleRefernce', { required: true })}
                        options={[
                            {
                                value: "Don't derive",
                                label: "Don't derive",
                            },
                            {
                                value: 'Derive from step 1',
                                label: 'Derive from step 1',
                            },
                            {
                                value: 'Derive from chain',
                                label: 'Derive from chain',
                            },
                        ]}
                        onChange={async (e) => {
                            form.setValue('deriveFromModuleRefernce', e?.value);

                            setModuleReferenceError(undefined);
                            setSchema(undefined);
                            setModuleReferenceLengthError(undefined);
                            form.setValue('smartContractName', undefined);

                            const selectValue = form.getValues('deriveFromModuleRefernce');

                            if (selectValue === 'Derive from step 1') {
                                setModuleReference(undefined);
                                form.setValue('moduleReferenceString', undefined);

                                if (moduleReferenceDeployed === undefined && moduleReferenceCalculated === undefined) {
                                    setModuleReferenceError('No module is uploaded in step 1');
                                }

                                const newModuleReference =
                                    moduleReferenceDeployed !== undefined
                                        ? moduleReferenceDeployed
                                        : moduleReferenceCalculated;

                                if (newModuleReference !== undefined) {
                                    setModuleReference(newModuleReference);
                                    form.setValue('moduleReferenceString', newModuleReference.moduleRef);

                                    // TODO schould this be consolidated ?
                                    setDisplayContracts(contracts);
                                    form.setValue('smartContractName', contracts[0]);
                                    setSchema(embeddedModuleSchemaBase64FromStep1);
                                }
                            }

                            if (selectValue === 'Derive from chain') {
                                if (moduleReference === undefined) {
                                    setModuleReferenceError('Set module reference field below');
                                } else {
                                    const module = await getModuleSource(client, moduleReference);

                                    let wasmModule;
                                    try {
                                        wasmModule = await WebAssembly.compile(module.source);
                                    } catch (err) {
                                        setModuleReferenceError('ModuleSource on chain is disrupted');
                                    }

                                    if (wasmModule) {
                                        const moduleFunctions = WebAssembly.Module.exports(wasmModule);

                                        const contractNames = [];
                                        for (let i = 0; i < moduleFunctions.length; i += 1) {
                                            if (moduleFunctions[i].name.startsWith('init_')) {
                                                contractNames.push(moduleFunctions[i].name.slice(5));
                                            }
                                        }

                                        setDisplayContracts(contractNames);
                                        form.setValue('smartContractName', contractNames[0]);

                                        const customSection = WebAssembly.Module.customSections(
                                            wasmModule,
                                            'concordium-schema'
                                        );

                                        const embeddedSchema = new Uint8Array(customSection[0]);

                                        // Use `reduce` to be able to convert large schema.
                                        const embeddedModuleSchemaBase64 = btoa(
                                            new Uint8Array(embeddedSchema).reduce(
                                                (data, byte) => data + String.fromCharCode(byte),
                                                ''
                                            )
                                        );
                                        setSchema(embeddedModuleSchemaBase64);
                                    }
                                }
                            }
                        }}
                    />
                    {deriveFromModuleRefernce === 'Derive from step 1' && (
                        <>
                            <br />
                            <Alert variant="info">
                                <div>
                                    You autofilled the <code>module reference</code>, the{' '}
                                    <code>smart contract name</code>, and the <code>input parameter schema</code> from
                                    the module in step1.
                                </div>
                            </Alert>
                            <Alert variant="info">
                                <div>
                                    - Select <b>Don&apos;t derive</b> in the above drop-down list, if you want to
                                    manually fill in a <code>module reference</code>, the{' '}
                                    <code>smart contract name</code>, or an <code>input parameter schema</code>.
                                </div>
                                <br />
                                <div>
                                    - Select <b>Don&apos;t derive</b> and then select <b>Derive from Step1</b> again, if
                                    you want to load a new module from <b>Step 1</b> because this box will not
                                    automatically update when you do changes to <b>Step 1</b>.
                                </div>
                            </Alert>
                            <br />
                        </>
                    )}
                    {deriveFromModuleRefernce === 'Derive from chain' && (
                        <>
                            <br />
                            <Alert variant="info">
                                <div>
                                    You autofilled the <code>smart contract name</code>, and the{' '}
                                    <code>input parameter schema</code> from a module refence already on chain.
                                </div>
                            </Alert>
                            <Alert variant="info" style={{ textAlign: 'left' }}>
                                <ul>
                                    <li>
                                        Select <b>Don&apos;t derive</b> in the above drop-down list, if you want to
                                        manually fill in the <code>smart contract name</code>, or an{' '}
                                        <code>input parameter schema</code>.
                                    </li>
                                    <li>
                                        Select <b>Don&apos;t derive</b> and then select <b>Derive from chain</b> again,
                                        if you want to load a new module from the chain because this box will not
                                        automatically update when you change the moduel reference in field below.
                                    </li>
                                </ul>
                            </Alert>
                            <br />
                        </>
                    )}
                </Form.Group>

                {moduleReferenceError && <Alert variant="danger"> Error: {moduleReferenceError}. </Alert>}
                <br />
                <Row>
                    <Form.Group className="col-md-4 mb-3">
                        <Form.Label> Module Reference</Form.Label>
                        <Form.Control
                            defaultValue={MODULE_REFERENCE_PLACEHOLDER}
                            disabled={deriveFromModuleRefernce === 'Derive from step 1'}
                            {...form.register('moduleReferenceString', {
                                required: true,
                                validate: validateModuleReference,
                            })}
                        />
                        {form.formState.errors.moduleReferenceString && (
                            <Alert variant="danger">
                                {' '}
                                Module reference is required. {form.formState.errors.moduleReferenceString.message}
                            </Alert>
                        )}
                        <Form.Text />
                    </Form.Group>

                    {deriveFromModuleRefernce !== "Don't derive" && displayContracts.length > 0 ? (
                        <Form.Group className="col-md-4 mb-3">
                            <Form.Label>Smart Contract Name</Form.Label>

                            <Select
                                {...form.register('smartContractName', { required: true })}
                                options={displayContracts?.map((contract) => ({
                                    value: contract,
                                    label: contract,
                                }))}
                                placeholder={displayContracts[0]}
                                onChange={(e) => {
                                    form.setValue('smartContractName', e?.value);
                                }}
                            />
                            {form.formState.errors.smartContractName && (
                                <Alert variant="info"> Smart contract name is required </Alert>
                            )}
                            <Form.Text />
                        </Form.Group>
                    ) : (
                        <Form.Group className="col-md-4 mb-3">
                            <Form.Label>Smart Contract Name</Form.Label>
                            <Form.Control
                                defaultValue="myContractName"
                                {...form.register('smartContractName', { required: true })}
                            />
                            {form.formState.errors.smartContractName && (
                                <Alert variant="info"> Smart contract name is required </Alert>
                            )}
                            <Form.Text />
                        </Form.Group>
                    )}

                    <Form.Group className="col-md-4 mb-3">
                        <Form.Label>Max Execution Energy</Form.Label>
                        <Form.Control
                            defaultValue={30000}
                            type="number"
                            min="0"
                            {...form.register('maxExecutionEnergy', { required: true })}
                        />
                        <Form.Text />
                        {form.formState.errors.maxExecutionEnergy && (
                            <Alert variant="info"> Max executiong energy is required </Alert>
                        )}
                    </Form.Group>
                </Row>

                {moduleReferenceLengthError && <Alert variant="danger"> Error: {moduleReferenceLengthError}. </Alert>}

                <Form.Group className="mb-3 d-flex justify-content-center">
                    <Form.Check
                        type="checkbox"
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
                        label="Has Input Parameter"
                        {...form.register('hasInputParameter')}
                        onChange={async (e) => {
                            const hasInputParameterRegister = form.register('hasInputParameter');

                            setParsingError(undefined);
                            form.setValue('inputParameterType', undefined);
                            form.setValue('inputParameter', undefined);
                            setInputParameterTemplate(undefined);
                            // If previously a file was uploaded and the schema was derived from it. Delete the schema.
                            if (file) {
                                setSchema(undefined);
                            }
                            setSchemaError(undefined);

                            hasInputParameterRegister.onChange(e);
                        }}
                    />
                </Form.Group>

                {hasInputParameter && (
                    <div className="box">
                        {deriveFromModuleRefernce === "Don't derive" && (
                            <Form.Group className="mb-3">
                                <Form.Label>Upload Smart Contract Module Schema File (e.g. schema.bin)</Form.Label>
                                <Form.Control
                                    type="file"
                                    accept=".bin"
                                    {...form.register('file')}
                                    onChange={async (e) => {
                                        const fileRegister = form.register('file');

                                        fileRegister.onChange(e);

                                        setUploadError2(undefined);
                                        setSchema(undefined);

                                        const files = form.getValues('file');

                                        if (files !== undefined && files !== null && files.length > 0) {
                                            const file0 = files[0];
                                            const arrayBuffer = await file0.arrayBuffer();

                                            // Use `reduce` to be able to convert large schemas.
                                            const embeddedSchema = btoa(
                                                new Uint8Array(arrayBuffer).reduce(
                                                    (data, byte) => data + String.fromCharCode(byte),
                                                    ''
                                                )
                                            );
                                            setSchema(embeddedSchema);
                                        } else {
                                            setUploadError2('Upload schema file is undefined');
                                        }
                                    }}
                                />
                                <Form.Text />
                            </Form.Group>
                        )}
                        {deriveFromModuleRefernce === "Don't derive" && schema && (
                            <div className="actionResultBox">
                                Schema in base64:
                                <div>{schema.toString().slice(0, 30)} ...</div>
                            </div>
                        )}
                        {uploadError2 !== undefined && <Alert variant="danger"> Error: {uploadError2}. </Alert>}
                        {schemaError !== undefined && <Alert variant="danger"> Error: {schemaError}. </Alert>}
                        {inputParameterTemplate && (
                            <>
                                <br />
                                <br />
                                <div className="actionResultBox">
                                    Parameter Template:
                                    <pre>{JSON.stringify(JSON.parse(inputParameterTemplate), undefined, 2)}</pre>
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
                                        const register = form.register('inputParameter', {
                                            required: true,
                                        });

                                        register.onChange(e);

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
                                        {getArrayExample(inputParameterTemplate)}
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
                                        {getObjectExample(inputParameterTemplate)}
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
                    Initialize Smart Contract
                </Button>
                <br />
                <br />
                {shouldWarnDifferenceModuleReferences && (
                    <Alert variant="warning">Warning: Module references in step 1 and step 2 are different.</Alert>
                )}
                {shouldWarnInputParameterInSchemaIgnored && (
                    <Alert variant="warning">
                        {' '}
                        Warning: Input parameter schema found but &quot;Has Input Parameter&quot; checkbox is unchecked.
                    </Alert>
                )}
                {!txHash && transactionError && <Alert variant="danger">Error: {transactionError}.</Alert>}
                {txHash && (
                    <TxHashLink
                        txHash={txHash}
                        isTestnet={isTestnet}
                        message="The smart contract index will appear below once the transaction is finalized."
                    />
                )}
                <br />
                {smartContractIndexError !== undefined && (
                    <Alert variant="danger"> Error: {smartContractIndexError}.</Alert>
                )}
                {smartContractIndex !== undefined && (
                    <div className="actionResultBox">
                        Smart Contract Inedex:
                        <div>{smartContractIndex}</div>
                    </div>
                )}
            </Form>
        </Box>
    );
}
