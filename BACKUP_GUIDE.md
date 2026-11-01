# Back up your data

MoneyTracker keeps records in its local database. It does not need a MoneyTracker server, Google API, OAuth client ID, or website.

## Save a backup on Android or iPhone

1. Open **Accounts** and tap **Backup**.
2. The first time, choose a location in the system folder picker. If Google Drive appears among the available locations, select it. You may need the Google Drive app installed and signed in on the device.
3. MoneyTracker creates a `MoneyTracker` folder in the selected location and saves a timestamped `MoneyTracker-backup-….json` file inside it. If you selected a folder already named `MoneyTracker`, it saves directly there.
4. Later backups reuse the selected folder if its permission is still available. If the device no longer grants access, choose the folder again.

The operating system and its installed file providers determine which locations appear. Android generally preserves the folder permission. iOS or a cloud file provider may ask you to select the folder again. If Drive is not listed, save the backup locally and move it to Drive using the Drive app.

On the laptop web preview, Backup downloads a JSON file through the browser; move that file to Drive yourself.

## Restore

Tap **Restore**, choose a MoneyTracker JSON backup, and confirm. Restore replaces the accounts and transactions currently stored on this device. Keep a separate backup copy before restoring if you may need the existing records.

The JSON file contains account and transaction details in readable form. Store it somewhere you trust.
