export function generateStartupScript(
  password: string,
  environments: string[]
): string {
  let script = `#!/bin/bash
echo "ubuntu:${password}" | chpasswd
sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
find /etc/ssh/sshd_config.d -type f -name "*.conf" -exec sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' {} \\;
systemctl restart ssh
apt update -y
`;

  if (environments.includes("docker")) {
    script += "apt install -y docker.io\n";
  }

  if (environments.includes("nodejs")) {
    script += "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -\n";
    script += "apt install -y nodejs\n";
  }

  if (environments.includes("python")) {
    script += "apt install -y python3 python3-pip\n";
  }

  if (environments.includes("mysql")) {
    script += "apt install -y mysql-server\n";
  }

  if (environments.includes("nginx")) {
    script += "apt install -y nginx\n";
  }

  return script;
}
