{
	// The app is not currently linked to the encore.dev platform.
	// Use "encore app link" to link it.
	"id":   "",
	"lang": "typescript",
	"global_cors": {
		// Split frontend/backend deployments must list the frontend origin here.
		// Encore supports wildcards such as "https://*.example.com" for credentialed origins:
		// https://encore.dev/docs/go/develop/cors
		"allow_origins_with_credentials": [
			"http://localhost:5173",
			"http://192.168.1.6:5173",
			"capacitor://localhost",
			"http://localhost"
		]
	}
}
