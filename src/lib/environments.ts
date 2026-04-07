export interface Environment {
  id: string;
  label: string;
  description: string;
}

export const environments: Environment[] = [
  {
    id: "docker",
    label: "Docker",
    description: "Container runtime engine",
  },
  {
    id: "nodejs",
    label: "NodeJS",
    description: "JavaScript runtime v20.x",
  },
  {
    id: "pm2",
    label: "PM2",
    description: "Production Process Manager for Node.js",
  },
  {
    id: "python",
    label: "Python",
    description: "Python 3 + pip",
  },
  {
    id: "java",
    label: "Java",
    description: "Default JDK",
  },
  {
    id: "php",
    label: "PHP",
    description: "PHP + CLI + FPM",
  },
  {
    id: "composer",
    label: "Composer",
    description: "Dependency manager for PHP",
  },
  {
    id: "go",
    label: "Go",
    description: "Golang programming language",
  },
  {
    id: "git",
    label: "Git",
    description: "Version control system",
  },
  {
    id: "mysql",
    label: "MySQL",
    description: "MySQL database server",
  },
  {
    id: "postgresql",
    label: "PostgreSQL",
    description: "Advanced open source database",
  },
  {
    id: "mongodb",
    label: "MongoDB",
    description: "NoSQL document database",
  },
  {
    id: "redis",
    label: "Redis",
    description: "In-memory data structure store",
  },
  {
    id: "nginx",
    label: "Nginx",
    description: "High-performance web server",
  },
  {
    id: "apache2",
    label: "Apache2",
    description: "Classic web server",
  },
];
