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
        CARGO_CONCORDIUM_EXECUTABLE = "s3://distribution.concordium.software/tools/macos/signed/cargo-concordium_${CARGO_CONCORDIUM_VERSION}"
        OUTFILE = "s3://distribution.concordium.software/tools/macos/vscode-smart-contracts_${VERSION}.vsix"
    }
    stages {
        stage('precheck') {
            steps {
                sh '''\
                    # Fail if file already exists
                    totalFoundObjects=$(aws s3 ls "$OUTFILE" --summarize | grep "Total Objects: " | sed "s/[^0-9]*//g")
                    if [ "$totalFoundObjects" -ne "0" ]; then
                        echo "$OUTFILE already exists"
                        false
                    fi
                '''.stripIndent()
            }
        }
        stage('prebuild') {
            steps {
                sh '''\
                    # Download cargo-concordium executable from S3.
                    aws s3 cp "${CARGO_CONCORDIUM_EXECUTABLE}" vscode-smart-contracts/executables/cargo-concordium
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
                    npx vsce package --target darwin-x64 --out ../out/extension.vsix
                '''.stripIndent()
                stash includes: 'out/extension.vsix', name: 'release'
            }
        }
        stage('Publish') {
            steps {
                unstash 'release'
                sh '''\
                    # Push to s3
                    aws s3 cp "out/extension.vsix" "${OUTFILE}" --grants read=uri=http://acs.amazonaws.com/groups/global/AllUsers
                '''.stripIndent()
            }
        }
    }
}
