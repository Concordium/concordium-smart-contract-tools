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
import { REFRESH_INTERVAL, INPUT_PARAMETER_TYPES_OPTIONS, REG_MODULE_REF } from '../constants';

interface ConnectionProps {
    isTestnet: boolean;
    account: string;
    connection: WalletConnection;
    client: ConcordiumGRPCClient | undefined;
    contracts: string[];
    embeddedModuleSchemaBase64: undefined | string;
    moduleReferenceCalculated: undefined | string;
    moduleReferenceDeployed: undefined | string;
}

/**
 * A component that manages the input fields and corresponding state to initialize a new smart contract instance on chain.
 * This components creates an `InitContract` transaction.
 */
export default function InitComponent(props: ConnectionProps) {
    const {
        isTestnet,
        account,
        connection,
        client,
        moduleReferenceCalculated,
        moduleReferenceDeployed,
        embeddedModuleSchemaBase64,
        contracts,
    } = props;

    type FormType = {
        moduleReference: string | undefined;
        smartContractName: string | undefined;
        file: FileList | undefined;
        useModuleReferenceFromStep1: boolean;
        inputParameterType: string | undefined;
        inputParameter: string | undefined;
        hasInputParameter: boolean;
        maxExecutionEnergy: number;
        isPayable: boolean;
        cCDAmount: number;
    };

    const form = useForm<FormType>({ mode: 'all' });

    const [
        useModuleReferenceFromStep1,
        smartContractName,
        inputParameterType,
        isPayable,
        hasInputParameter,
        moduleReference,
    ] = useWatch({
        control: form.control,
        name: [
            'useModuleReferenceFromStep1',
            'smartContractName',
            'inputParameterType',
            'isPayable',
            'hasInputParameter',
            'moduleReference',
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

    const [uploadedModuleSchemaBase64, setUploadedModuleSchemaBase64] = useState<string | undefined>(undefined);

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
            if (REG_MODULE_REF.test(moduleReference)) {
                client
                    .getModuleSource(ModuleReference.fromHexString(moduleReference))
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

            let schema = '';

            const schemaFromModule = useModuleReferenceFromStep1
                ? embeddedModuleSchemaBase64
                : uploadedModuleSchemaBase64;

            if (schemaFromModule !== undefined) {
                schema = schemaFromModule;
            }

            const inputParamterTypeSchemaBuffer = getInitContractParameterSchema(
                toBuffer(schema, 'base64'),
                ContractName.fromString(smartContractName),
                2
            );

            initTemplate = displayTypeSchemaTemplate(inputParamterTypeSchemaBuffer);

            setInputParameterTemplate(initTemplate);
        } catch (e) {
            if (useModuleReferenceFromStep1) {
                setSchemaError(
                    `Could not get embedded schema from the uploaded module. Uncheck "Use Module from Step 1" checkbox to manually upload a schema or uncheck "Has Input Paramter" checkbox if this entrypoint has no input parameter.  Original error: ${e}`
                );
            } else {
                setSchemaError(
                    `Could not get schema from uploaded schema. Uncheck "Has Input Paramter" checkbox if this entrypoint has no input parameter. Original error: ${e}`
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
    }, [
        hasInputParameter,
        useModuleReferenceFromStep1,
        smartContractName,
        uploadedModuleSchemaBase64,
        inputParameterType,
    ]);

    function onSubmit(data: FormType) {
        setTxHash(undefined);
        setSmartContractIndexError(undefined);
        setSmartContractIndex(undefined);
        setTransactionError(undefined);

        const schema = data.useModuleReferenceFromStep1 ? embeddedModuleSchemaBase64 : uploadedModuleSchemaBase64;

        // Send init transaction

        const tx = initialize(
            connection,
            AccountAddress.fromBase58(account),
            isModuleReferenceAlreadyDeployedStep2,
            data.moduleReference ? ModuleReference.fromHexString(data.moduleReference) : undefined,
            data.inputParameter,
            data.smartContractName ? ContractName.fromString(data.smartContractName) : undefined,
            data.hasInputParameter,
            data.useModuleReferenceFromStep1,
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
                <Form.Group className="mb-3 d-flex justify-content-center">
                    <Form.Check
                        type="checkbox"
                        label="Use Module From Step 1"
                        {...form.register('useModuleReferenceFromStep1')}
                        onChange={async (e) => {
                            const register = form.register('useModuleReferenceFromStep1');

                            register.onChange(e);

                            setModuleReferenceError(undefined);
                            form.setValue('moduleReference', undefined);

                            setUploadedModuleSchemaBase64(undefined);

                            const checkboxElement = form.getValues('useModuleReferenceFromStep1');

                            form.setValue('moduleReference', undefined);
                            setModuleReferenceLengthError(undefined);

                            if (
                                checkboxElement &&
                                moduleReferenceDeployed === undefined &&
                                moduleReferenceCalculated === undefined
                            ) {
                                setModuleReferenceError('No module is uploaded in step 1');
                            }

                            const newModuleReference =
                                moduleReferenceDeployed !== undefined
                                    ? moduleReferenceDeployed
                                    : moduleReferenceCalculated;

                            if (checkboxElement && newModuleReference !== undefined) {
                                form.setValue('moduleReference', newModuleReference);

                                setDisplayContracts(contracts);
                                form.setValue('smartContractName', contracts[0]);
                            }
                        }}
                    />
                </Form.Group>

                {useModuleReferenceFromStep1 && (
                    <>
                        <br />
                        <Alert variant="info">
                            <div>
                                This checkbox autofilled the <code>module reference</code>, the{' '}
                                <code>smart contract name</code>, and the <code>input parameter schema</code> from the
                                module in step1.
                            </div>
                            <br />
                            <div>
                                <b>Uncheck</b> this box, if you want to manually fill in a <code>module reference</code>
                                , the <code>smart contract name</code>, or an <code>input parameter schema</code>.
                            </div>
                            <br />
                            <div>
                                <b>Uncheck</b> and <b>check</b> this box again, if you want to load a new module from
                                step 1.
                            </div>
                        </Alert>
                        <br />
                    </>
                )}

                {moduleReferenceError && <Alert variant="danger"> Error: {moduleReferenceError}. </Alert>}

                <Row>
                    <Form.Group className="col-md-4 mb-3">
                        <Form.Label> Module Reference</Form.Label>
                        <Form.Control
                            defaultValue="91225f9538ac2903466cc4ab07b6eb607a2cd349549f357dfdf4e6042dde0693"
                            disabled={!!useModuleReferenceFromStep1}
                            {...form.register('moduleReference', { required: true })}
                            onChange={(e) => {
                                const register = form.register('moduleReference', {
                                    required: true,
                                });

                                register.onChange(e);

                                setModuleReferenceLengthError(undefined);

                                const moduleRef = form.getValues('moduleReference');

                                if (moduleRef !== undefined && !REG_MODULE_REF.test(moduleRef)) {
                                    setModuleReferenceLengthError(
                                        'Module reference has to be a valid hex string `[0-9A-Fa-f]` of length 64'
                                    );
                                }
                            }}
                        />
                        <Form.Text />
                        {form.formState.errors.moduleReference && (
                            <Alert variant="info">Module reference is required </Alert>
                        )}
                    </Form.Group>

                    {useModuleReferenceFromStep1 && displayContracts.length > 0 ? (
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

                            hasInputParameterRegister.onChange(e);

                            setParsingError(undefined);
                            form.setValue('inputParameterType', undefined);
                            form.setValue('inputParameter', undefined);
                            setInputParameterTemplate(undefined);
                            setUploadedModuleSchemaBase64(undefined);
                            setSchemaError(undefined);
                        }}
                    />
                </Form.Group>

                {hasInputParameter && (
                    <div className="box">
                        {!useModuleReferenceFromStep1 && (
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
                                            setUploadError2('Upload schema file is undefined');
                                        }
                                    }}
                                />
                                <Form.Text />
                            </Form.Group>
                        )}
                        {!useModuleReferenceFromStep1 && uploadedModuleSchemaBase64 && (
                            <div className="actionResultBox">
                                Schema in base64:
                                <div>{uploadedModuleSchemaBase64.toString().slice(0, 30)} ...</div>
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
