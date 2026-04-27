export interface Environment {
  id: string;
  label: string;
  description: string;
  icon: string;
}

export const environments: Environment[] = [
  {
    id: "docker",
    label: "Docker",
    description: "Container runtime engine",
    icon: "🐳",
  },
  {
    id: "nodejs",
    label: "Node.js",
    description: "JavaScript runtime v20.x",
    icon: "🟢",
  },
  {
    id: "pm2",
    label: "PM2",
    description: "Process manager cho Node.js",
    icon: "⚙️",
  },
  {
    id: "python",
    label: "Python 3",
    description: "Python 3 + pip",
    icon: "🐍",
  },
  {
    id: "java",
    label: "Java (JDK)",
    description: "default-jdk",
    icon: "☕",
  },
  {
    id: "php",
    label: "PHP",
    description: "PHP + CLI + FPM",
    icon: "🐘",
  },
  {
    id: "composer",
    label: "Composer",
    description: "Dependency manager cho PHP",
    icon: "🎼",
  },
  {
    id: "go",
    label: "Go",
    description: "Golang programming language",
    icon: "🐹",
  },
  {
    id: "git",
    label: "Git",
    description: "Version control system",
    icon: "🌿",
  },
  {
    id: "mysql",
    label: "MySQL",
    description: "MySQL database server",
    icon: "🛢️",
  },
  {
    id: "postgresql",
    label: "PostgreSQL",
    description: "Advanced open source database",
    icon: "🐘",
  },
  {
    id: "mongodb",
    label: "MongoDB",
    description: "NoSQL document database",
    icon: "🍃",
  },
  {
    id: "redis",
    label: "Redis",
    description: "In-memory data store",
    icon: "🟥",
  },
  {
    id: "nginx",
    label: "Nginx",
    description: "High-performance web server",
    icon: "🌐",
  },
  {
    id: "apache2",
    label: "Apache2",
    description: "Classic web server",
    icon: "🪶",
  },
];
