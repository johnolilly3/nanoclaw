# Gmail

Read and manage the user's Gmail via the `gmail-cli` tool.

## Usage

```bash
gmail-cli inbox              # Latest 10 inbox messages
gmail-cli inbox 5            # Latest 5
gmail-cli read <messageId>   # Read full message
gmail-cli search <query>     # Search (Gmail search syntax)
gmail-cli send <to> <subject> <body>   # Send email
gmail-cli draft <to> <subject> <body>  # Create draft
gmail-cli reply <messageId> <body>     # Reply to message
gmail-cli labels             # List all labels
```

## Search examples

```bash
gmail-cli search "from:alice@example.com"
gmail-cli search "subject:invoice is:unread"
gmail-cli search "newer_than:7d"
```

## Notes
- Message IDs from inbox/search can be used with read/reply
- The tool auto-refreshes OAuth tokens
- ALWAYS ask the user before sending emails
