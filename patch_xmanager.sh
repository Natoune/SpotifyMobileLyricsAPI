#!/bin/bash

set +x

#### Fetch Arguments ####
while [ "$1" != "" ]; do
    case $1 in
    --server)
        shift
        server=$1
        ;;
    --name)
        shift
        name=$1
        ;;
    --apk)
        shift
        apk=$1
        ;;
    esac
    shift
done

if [ -z "$server" ]; then
    server="lyrics.natanchiodi.fr"
fi

if [ -z "$name" ]; then
    name="Natan Chiodi"
fi

if [ ! -z "$apk" ] && [ ! -f "$apk" ]; then
    echo "The provided APK file does not exist."
    exit
fi

#### Check Dependencies ####
if ! command -v wget &>/dev/null; then
    echo "wget is not installed. Please install it."
    exit
fi

if ! command -v java &>/dev/null; then
    echo "Java JDK is not installed. Please install it."
    exit
fi

if ! command -v keytool &>/dev/null; then
    echo "Java JDK is not installed. Please install it."
    exit
fi

if ! command -v jar &>/dev/null; then
    echo "Java JDK is not installed. Please install it."
    exit
fi

if ! command -v jq &>/dev/null; then
    echo "jq is not installed. Please install it."
    exit
fi

if ! command -v openssl &>/dev/null; then
    echo "OpenSSL is not installed. Please install it."
    exit
fi

#### Create Temporary Directory ####
rm -rf $PWD/tmp-patch_xmanager &>/dev/null
mkdir $PWD/tmp-patch_xmanager &>/dev/null
cd $PWD/tmp-patch_xmanager

#### Download Required Tools ####
echo "Downloading required tools..."
wget https://github.com/REAndroid/APKEditor/releases/download/V1.4.0/APKEditor-1.4.0.jar -q -O APKEditor.jar

wget https://dl.google.com/android/repository/build-tools_r34-linux.zip -q -O build-tools.zip
jar xvf build-tools.zip &>/dev/null
mv android-14 build-tools &>/dev/null
rm build-tools.zip &>/dev/null
chmod +x build-tools/zipalign &>/dev/null
chmod +x build-tools/apksigner &>/dev/null

#### Get Patched Spotify Releases ####
if [ -z "$apk" ]; then
    echo "No APK provided. Fetching latest patched Spotify release..."

    wget https://github.com/Team-xManager/xManager/releases/latest/download/xManager.apk -q -O xManager.apk
    java -jar APKEditor.jar d -i xManager.apk -o xManager &>/dev/null
    url=$(grep -o 'https://gist.githubusercontent.com/[^<]*' xManager/resources/package_1/res/values/strings.xml)
    alt="Stock_Patched"

    while true; do
        echo "Which version of Spotify do you want to patch?"
        echo "1) Stock"
        echo "2) Amoled"
        echo "3) Lite"
        read -p "Enter your choice: " choice

        if [ "$choice" == "1" ]; then
            alt="Stock_Patched"
            break
        elif [ "$choice" == "2" ]; then
            alt="Amoled_Patched"
            break
        elif [ "$choice" == "3" ]; then
            alt="Lite_Patched"
            break
        else
            echo "Invalid choice."
            echo
        fi
    done

    wget $url -q -O versions.json
    mirror=$(jq -r ".$alt[-1].Mirror" versions.json)

    if [[ $mirror == *"fileport"* ]]; then
        wget $mirror -q -O $alt.apk
    else
        echo "An error occurred while downloading the APK. Please download it manually and use the --apk flag."
        echo "Download link: $mirror"
        exit
    fi

    wget --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36" $mirror -q -O $alt.html
    download_path=$(grep -oP 'data-url="[^"]*' $alt.html | cut -d '"' -f 2)
    wget --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36" https://fileport.io$download_path -q -O $alt.apk

    apk=$alt.apk

    rm xManager.apk &>/dev/null
    rm versions.json &>/dev/null
    rm $alt.html &>/dev/null
else
    cd ..
    cp "$apk" tmp-patch_xmanager/input.apk
    cd tmp-patch_xmanager
    apk="input.apk"
fi

#### Patch Spotify ####
echo "Patching Spotify..."
folder=$(basename "$apk" .apk)
java -jar APKEditor.jar d -i $apk -o $folder &>/dev/null

## Change Server
manifest_file=$(find "$folder" -name "AndroidManifest.xml")
package=$(grep -oP 'package="[^"]*' $manifest_file | cut -d '"' -f 2)

if [ "$package" == "com.spotify.lite" ]; then
    # Lite
    smali_file=$(find "$folder" -name "mk3.smali")
    sed -i "s/const-string v2, \"https:\/\/xmanager-lyrics.dev\/\"/const-string v2, \"https:\/\/$server\/\"/g" $smali_file &>/dev/null
    sed -i "s/const-string v2, \"https:\/\/spclient.wg.spotify.com\/\"/const-string v2, \"https:\/\/$server\/\"/g" $smali_file &>/dev/null
else
    # Stock / Amoled
    smali_file=$(find "$folder" -name "RetrofitUtil.smali")
    sed -i "s/const-string\/jumbo v1, \"xmanager-lyrics.dev\"/const-string\/jumbo v1, \"$server\"/g" $smali_file &>/dev/null
    sed -i "s/const-string\/jumbo v1, \"spclient.wg.spotify.com\"/const-string\/jumbo v1, \"$server\"/g" $smali_file &>/dev/null
fi

## SSL Pinning Bypass
network_security_file=$(find "$folder" -name "network_security_config.xml")
if [ -f "$network_security_file" ]; then
    sed -i 's/<base-config cleartextTrafficPermitted="true" \/>/<base-config cleartextTrafficPermitted="true">\n    <trust-anchors>\n        <certificates src="system" \/>\n        <certificates src="user" overridePins="true" \/>\n    <\/trust-anchors>\n  <\/base-config>/g' $network_security_file &>/dev/null
fi

#### Build Patched APK ####
echo "Building patched APK..."
java -jar APKEditor.jar b -i $folder -o patched.apk &>/dev/null

./build-tools/zipalign -p -f 4 patched.apk aligned.apk &>/dev/null

if [ ! -f "aligned.apk" ]; then
    echo "An error occurred while building the patched APK."
    exit
fi

#### Sign APK ####
echo "Signing APK..."
password=$(openssl rand -base64 32)
keytool -genkey -v -keystore keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias "$name" -storepass $password -keypass $password -dname "CN=$name" &>/dev/null
./build-tools/apksigner sign --ks keystore.jks --ks-pass pass:$password --ks-key-alias "$name" --key-pass pass:$password --out ../$apk aligned.apk &>/dev/null

#### Cleanup ####
cd ..
rm -rf ./tmp-patch_xmanager &>/dev/null

echo "Patched APK saved as $apk"
