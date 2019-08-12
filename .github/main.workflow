workflow "Publish on Release" {
  on = "release"
  resolves = ["publish"]
}

action "install" {
  uses = "actions/npm@59b64a598378f31e49cb76f27d6f3312b582f680"
  args = "install"
}

action "publish" {
  needs = "install"
  uses = "actions/npm@59b64a598378f31e49cb76f27d6f3312b582f680"
  args = "publish --unsafe-perm"
  secrets = ["NPM_AUTH_TOKEN"]
}
