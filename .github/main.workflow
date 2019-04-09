workflow "Publish to npm on Release" {
  resolves = ["publish"]
  on = "release"
}

action "publish" {
  uses = "actions/npm@59b64a598378f31e49cb76f27d6f3312b582f680"
  args = "publish"
  secrets = ["NPM_AUTH_TOKEN"]
}
