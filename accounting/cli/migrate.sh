usage() {
    echo "Usage: $0 <user> <password> <group> [ICES_URL] [KOMUNITIN_ACCOUNTING_URL]"
    exit
}

if [ $# -lt 3 ]; then
    usage
fi

USERNAME=$1
PASSWORD=$2
GROUP=$3
DEFAULT_ICES_URL=${ICES_URL:-http://localhost:2029}
ICES_URL=${4:-$DEFAULT_ICES_URL}
DEFAULT_KOMUNITIN_ACCOUNTING_URL=${KOMUNITIN_ACCOUNTING_URL:-http://localhost:2025}
KOMUNITIN_ACCOUNTING_URL=${5:-$DEFAULT_KOMUNITIN_ACCOUNTING_URL}


echo "Getting access token from $ICES_URL..."
cd "$(dirname "$0")"
ACCESS_TOKEN=$(./access.sh $USERNAME $PASSWORD $ICES_URL komunitin_superadmin)

echo "Migrating group $GROUP from $ICES_URL to $KOMUNITIN_ACCOUNTING_URL..."

JSON_DATA=$(cat <<EOF
{
  "data": {
    "type": "migrations",
    "attributes": {
      "code": "$GROUP",
      "name": "$GROUP Migration",
      "kind": "integralces-accounting",
      "data": {
        "source": {
          "url": "$ICES_URL",
          "tokens": {
            "accessToken": "$ACCESS_TOKEN",
            "expiresAt": "$(date -u -d '+1 hour' +'%Y-%m-%dT%H:%M:%SZ')"
          }
        }      
      }
    }
  }
}
EOF
)

RESPONSE=$(curl -s -X POST $KOMUNITIN_ACCOUNTING_URL/migrations \
  -H "Content-Type: application/vnd.api+json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "$JSON_DATA")

# extract migration id from response
MIGRATION_ID=$(echo $RESPONSE | jq -r '.data.id')

# Play migration
curl -s -X POST $KOMUNITIN_ACCOUNTING_URL/migrations/$MIGRATION_ID/play \
  -H "Content-Type: application/vnd.api+json" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

echo "Waiting for migration to complete..."

TIMEOUT=300  # 5 minutes timeout
INTERVAL=2   # Check every 2 seconds
ELAPSED=0

while [ $ELAPSED -lt $TIMEOUT ]; do
    # Check migration status
    MIGRATION=$(curl -s -X GET $KOMUNITIN_ACCOUNTING_URL/migrations/$MIGRATION_ID \
      -H "Content-Type: application/vnd.api+json" \
      -H "Authorization: Bearer $ACCESS_TOKEN")
    
    STATUS=$(echo $MIGRATION | jq -r '.data.attributes.status')
    
    echo "Migration status: $STATUS (${ELAPSED}s elapsed)"
    
    # Check if status is no longer "started"
    if [ "$STATUS" != "started" ]; then
        echo "Migration completed with status: $STATUS"
        break
    fi
    
    # Wait before next check
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

# Check if we timed out
if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "ERROR: Migration timed out after ${TIMEOUT} seconds"
    exit 1
fi

# Show final migration state
echo "Final migration state:"
echo $MIGRATION | jq '.'
