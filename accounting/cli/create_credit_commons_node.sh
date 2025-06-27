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

# Fetch the ICES_URL/users/me endpoint to get the account id.

echo "$ICES_URL/ces/api/social/users/me?include=members"
RESPONSE=$(curl -H "Authorization: Bearer $ACCESS_TOKEN" "$ICES_URL/ces/api/social/users/me?include=members")
# Find the account id with sed from the string http:\/\/localhost:2025\/NET2\/accounts\/fdf571f1-3248-4491-8dee-f91207803fe0
# Note that the url slashes are weirdly escaped in the response, so we may need to change that someday.
ACCOUNT_ID=$(echo $RESPONSE | sed -n 's/.*\/accounts\\\/\([^"]*\).*/\1/p')
# If ACCOUNT_ID is empty, exit with an error.
if [ -z "$ACCOUNT_ID" ]; then
  echo "Error: Could not retrieve account ID from ICES_URL."
  exit 1
fi
# Print the account id for debugging purposes.
echo "Account ID: $ACCOUNT_ID"

curl -i -H 'Content-Type: application/json' -H "Authorization: Bearer $ACCESS_TOKEN" -X POST -d"{\"data\":{\"attributes\":{\"peerNodePath\":\"trunk\",\"ourNodePath\":\"trunk/$3\",\"url\":\"$4/\",\"lastHash\":\"trunk\",\"vostroId\":\"$ACCOUNT_ID\"},\"relationships\":{\"vostro\":{\"data\":{\"type\":\"accounts\",\"id\":\"$ACCOUNT_ID\"}}}}}" http://localhost:2025/$3/cc/nodes




