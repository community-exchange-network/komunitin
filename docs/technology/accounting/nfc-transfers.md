# NFC transfers

NFC transfers are a transfer workflow using low-cost and read-only NFC tags. Each NFC tag contains an identifier that can be read using a NFC reader such as the ones found in current smartphones

The idea behind this method is to be able to link a NFC tag with a Komunitin account, so this account has this additional identifier. In fact several different tags can be linked to one account, but two accounts can't share a single tag.&#x20;

#### Workflow

The NFC transfer workflow is, from the user point of view, not very different from the QR workflow. But it is the destination account that actually submits a transfer request to the server instead of the source (that of course can't submit anything from their tag). Indeed, the destination account sets the transfer description and amount and reads the NFC tag from the source. This NFC tag identifies the source account and the destination sends a transfer request to the source account, adding the NFC tag identifier. The server will immediately authorize the transfer.

#### Security

Note that this transfer method is not suitable for every use case since the NFC tags can be copied. The way to mitigate this risk is to disable the ability to make tag transfer requests for all but a whitelist of approved users. Also, if a NFC tag is compromised, it can be immediately unlinked from the account at the settings page.

Note that the tags are not stored in the server, but a secure digest of them.







