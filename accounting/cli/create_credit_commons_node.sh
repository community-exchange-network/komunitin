usage() {
  echo "Usage: $0 <user> <password> <currency_code> <cc_node_url> [ICES_URL] [KOMUNITIN_ACCOUNTING_URL]"
  exit 1
}

if [ $# -lt 4 ]; then
    usage
fi

DEFAULT_KOMUNITIN_ACCOUNTING_URL=${KOMUNITIN_ACCOUNTING_URL:-http://localhost:2025}
KOMUNITIN_ACCOUNTING_URL=${6:-$DEFAULT_KOMUNITIN_ACCOUNTING_URL}

DEFAULT_ICES_URL=${ICES_URL:-http://localhost:2029}
ICES_URL=${5:-$DEFAULT_ICES_URL}

echo "Getting access token from $ICES_URL..."
cd "$(dirname "$0")"
ACCESS_TOKEN=$(./access.sh $1 $2 $ICES_URL)
echo $ACCESS_TOKEN

# Tired of changing this? Get the account id from the /me endpoint ;)
VOSTRO="756c6e85-7541-42be-a383-dfa2e70ea3b7"

curl -i -H 'Content-Type: application/json' -H "Authorization: Bearer $ACCESS_TOKEN" -X POST -d"{\"data\":{\"attributes\":{\"peerNodePath\":\"trunk\",\"ourNodePath\":\"trunk/$3\",\"url\":\"$4/\",\"lastHash\":\"trunk\",\"vostroId\":\"$VOSTRO\"},\"relationships\":{\"vostro\":{\"data\":{\"type\":\"accounts\",\"id\":\"$VOSTRO\"}}}}}" http://localhost:2025/$3/cc/nodes




