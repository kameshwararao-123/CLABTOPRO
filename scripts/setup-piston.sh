#!/bin/bash
# ==============================================================================
# CLABTOPro - Piston Docker Sandbox Setup & C Package Installer
# ==============================================================================

set -e

echo "=== [1/4] Checking Docker Installation ==="
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed on this machine."
    echo "To install Docker on Ubuntu, run:"
    echo "  sudo apt update"
    echo "  sudo apt install -y docker.io docker-compose-v2"
    echo "  sudo usermod -aG docker \$USER"
    echo "Then log out and log back in."
    exit 1
fi

echo "Docker is available: $(docker --version)"

echo "=== [2/4] Starting Piston Execution Sandbox ==="
if [ -f "docker-compose.piston.yml" ]; then
    docker compose -f docker-compose.piston.yml up -d
else
    docker run -d \
      -p 2000:2000 \
      --name clab-piston \
      --restart unless-stopped \
      --tmpfs /tmp:exec,mode=1777 \
      --security-opt seccomp:unconfined \
      --cap-add SYS_ADMIN \
      --pids-limit 120 \
      --memory 1024m \
      ghcr.io/engineer-man/piston:latest
fi

echo "Waiting for Piston to initialize on http://localhost:2000..."
for i in {1..15}; do
    if curl -s http://localhost:2000/api/v2/runtimes > /dev/null 2>&1; then
        echo "Piston engine is online!"
        break
    fi
    sleep 1
done

echo "=== [3/4] Installing C Language Runtime Package ==="
# Check if C is already installed
if curl -s http://localhost:2000/api/v2/runtimes | grep -q '"language":"c"'; then
    echo "C language package is already installed."
else
    echo "Installing C compiler into Piston..."
    curl -s -X POST http://localhost:2000/api/v2/packages \
      -H "Content-Type: application/json" \
      -d '{"language": "c", "version": "10.2.0"}' || true
fi

echo "=== [4/4] Verifying C Code Execution ==="
TEST_RESPONSE=$(curl -s -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "c",
    "version": "*",
    "files": [{
      "name": "test.c",
      "content": "#include <stdio.h>\nint main(){ int a,b; scanf(\"%d %d\", &a, &b); printf(\"%d\", a+b); return 0; }"
    }],
    "stdin": "10 20"
  }')

echo "Test Execution Response:"
echo "$TEST_RESPONSE"

if echo "$TEST_RESPONSE" | grep -q '"output":"30"'; then
    echo "✓ Piston execution verified! C Program output '30' successfully."
else
    echo "Note: Verify response above. Piston is running on http://localhost:2000."
fi

echo "=== Setup Complete! PISTON_URL=http://localhost:2000 ==="
