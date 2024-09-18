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

if ! command -v jq &>/dev/null; then
    echo "jq is not installed. Please install it."
    exit
fi

if ! command -v openssl &>/dev/null; then
    echo "OpenSSL is not installed. Please install it."
    exit
fi

#### Create Temporary Directory ####
rm -rf $PWD/tmp &>/dev/null
mkdir $PWD/tmp &>/dev/null
cd $PWD/tmp

#### Download Required Tools ####
echo "Downloading required tools..."
wget https://bitbucket.org/iBotPeaches/apktool/downloads/apktool_2.9.3.jar -q -O apktool.jar

wget https://dl.google.com/android/repository/build-tools_r34-rc3-linux.zip -q -O build-tools.zip
unzip build-tools.zip &>/dev/null
mv android-UpsideDownCake build-tools &>/dev/null
rm build-tools.zip &>/dev/null

#### Get Patched Spotify Releases ####
if [ -z "$apk" ]; then
    echo "No APK provided. Fetching latest patched Spotify release..."

    wget https://github.com/Team-xManager/xManager/releases/latest/download/xManager.apk -q -O xManager.apk
    java -jar apktool.jar d xManager.apk &>/dev/null
    url=$(grep -o 'https://gist.githubusercontent.com/[^<]*' xManager/res/values/strings.xml)
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
    mirror=$(jq -r ".$alt[0].Mirror" versions.json)

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
    cp "$apk" tmp/input.apk
    cd tmp
    apk="input.apk"
fi

#### Patch Spotify ####
echo "Patching Spotify..."
java -jar apktool.jar d $apk &>/dev/null
folder=$(basename "$apk" .apk)

smali_file=$(find "$folder" -name "RetrofitUtil.smali")
if [ -z "$smali_file" ]; then
    echo "An error occurred while patching Spotify. Please try again."
    exit
fi

sed -i "s/const-string\/jumbo v1, \"spclient.wg.spotify.com\"/const-string\/jumbo v1, \"$server\"/g" $smali_file &>/dev/null

#### Build Patched APK ####
echo "Building patched APK..."
java -jar apktool.jar b $folder &>/dev/null
mv "$folder/dist/$apk" patched.apk &>/dev/null

./build-tools/zipalign -p -f 4 patched.apk aligned.apk &>/dev/null

#### Sign APK ####
echo "Signing APK..."
password=$(openssl rand -base64 32)
keytool -genkey -v -keystore keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias "$name" -storepass $password -keypass $password -dname "CN=$name" &>/dev/null
./build-tools/apksigner sign --ks keystore.jks --ks-pass pass:$password --ks-key-alias "$name" --key-pass pass:$password --out ../Spotify.apk aligned.apk &>/dev/null

#### Cleanup ####
cd ..
rm -rf ./tmp &>/dev/null

echo "Patched APK saved as Spotify.apk"
