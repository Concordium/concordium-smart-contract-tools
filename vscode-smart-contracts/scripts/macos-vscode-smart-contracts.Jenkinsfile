pipeline {
    agent {
        label 'jenkins-worker'
    }
    environment {
        VERSION = sh(
            returnStdout: true,
            script: '''\
                # Extract version number if not set as parameter
                [ -z "$VERSION" ] && VERSION=$(awk -F'"' '/"version": ".+"/{ print $4; exit; }' vscode-smart-contracts/package.json)
                echo -n "$VERSION"
            '''.stripIndent()
        )
        CARGO_CONCORDIUM_VERSION = sh(
            returnStdout: true,
            script: '''\
                # Extract version number if not set as parameter
                [ -z "$CARGO_CONCORDIUM_VERSION" ] && CARGO_CONCORDIUM_VERSION=$(awk '/version = / { print substr($3, 2, length($3)-2); exit }' cargo-concordium/Cargo.toml)
                echo -n "$CARGO_CONCORDIUM_VERSION"
            '''.stripIndent()
        )
        CARGO_CONCORDIUM_EXECUTABLE = "s3://distribution.concordium.software/tools/macos/signed/cargo-concordium_${CARGO_CONCORDIUM_VERSION}.zip"
        OUTFILE_ARM64 = "s3://distribution.concordium.software/tools/macos/vscode-smart-contracts_${VERSION}-darwin-arm64.vsix"
        OUTFILE_X64 = "s3://distribution.concordium.software/tools/macos/vscode-smart-contracts_${VERSION}-darwin-x64.vsix"
    }
    stages {
        stage('precheck') {
            steps {
                sh '''\
                    # Fail if files already exists
                    totalFoundObjectsArm=$(aws s3 ls "$OUTFILE_ARM64" --summarize | grep "Total Objects: " | sed "s/[^0-9]*//g")
                    if [ "$totalFoundObjectsArm" -ne "0" ]; then
                        echo "$OUTFILE_ARM64 already exists"
                        false
                    fi
                    totalFoundObjectsX64=$(aws s3 ls "$OUTFILE_X64" --summarize | grep "Total Objects: " | sed "s/[^0-9]*//g")
                    if [ "$totalFoundObjectsX64" -ne "0" ]; then
                        echo "$OUTFILE_X64 already exists"
                        false
                    fi
                '''.stripIndent()
            }
        }
        stage('prebuild') {
            steps {
                sh '''\
                    # Download zipped cargo-concordium executable from S3.
                    aws s3 cp "${CARGO_CONCORDIUM_EXECUTABLE}" tmp/cargo-concordium.zip

                    unzip tmp/cargo-concordium.zip -d tmp

                    # Move binary to right location
                    mkdir vscode-smart-contracts/executables
                    mv tmp/cargo-concordium_${CARGO_CONCORDIUM_VERSION} vscode-smart-contracts/executables/cargo-concordium

                    # Make binary executable.
                    chmod +x vscode-smart-contracts/executables/cargo-concordium
                '''.stripIndent()
                stash includes: 'vscode-smart-contracts/executables/*', name: 'executables'
            }
        }
        stage('build') {
            agent {
                docker {
                    reuseNode true
                    image 'node:16'
                }
            }
            steps {
                unstash 'executables'
                sh '''\
                    cd vscode-smart-contracts

                    # Prepare output directory.
                    mkdir ../out

                    # Install dependencies
                    npm ci

                    # Build the extension
                    npx vsce package --target darwin-x64 --out ../out/extension-x64.vsix
                    npx vsce package --target darwin-arm64 --out ../out/extension-arm64.vsix
                '''.stripIndent()
                stash includes: 'out/*', name: 'release'
            }
        }
        stage('Publish') {
            steps {
                unstash 'release'
                sh '''\
                    # Push to s3
                    aws s3 cp "out/extension-x64.vsix" "${OUTFILE_X64}" --grants read=uri=http://acs.amazonaws.com/groups/global/AllUsers
                    aws s3 cp "out/extension-arm64.vsix" "${OUTFILE_ARM64}" --grants read=uri=http://acs.amazonaws.com/groups/global/AllUsers
                '''.stripIndent()
            }
        }
    }
}
