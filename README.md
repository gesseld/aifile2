# AIFile2 Project

A full-stack web application with FastAPI backend and React frontend.

## Project Structure

```
aifile2/
├── backend/           # FastAPI Python backend
│   ├── app/
│   │   ├── main.py           # FastAPI application entry point
│   │   └── api/v1/routers/   # API route handlers
│   ├── requirements.txt      # Python dependencies
│   └── docker-compose.yml    # Backend Docker configuration
├── frontend/          # React frontend
│   ├── src/
│   │   ├── App.jsx          # Main React component
│   │   └── main.jsx         # React entry point
│   ├── package.json         # Node.js dependencies
│   ├── vite.config.js       # Vite build configuration
│   ├── tailwind.config.js   # Tailwind CSS configuration
│   └── docker-compose.yml   # Frontend Docker configuration
├── justfile           # Task automation (alternative to Makefile)
└── README.md          # This file
```

## Prerequisites

- **Node.js** (v16 or higher)
- **Python** (v3.8 or higher)
- **Docker** and **Docker Compose**
- **Just** command runner (optional, for using justfile)

## Quick Start

### Option 1: Using Just (Recommended)

1. **Install Just** (if not already installed):

   ```bash
   # On macOS
   brew install just

   # On Ubuntu/Debian
   wget -qO - 'https://proget.makedeb.org/debian-feeds/prebuilt-mpr.pub' | gpg --dearmor | sudo tee /usr/share/keyrings/prebuilt-mpr-archive-keyring.gpg 1> /dev/null
   echo "deb [arch=all,amd64,arm64 signed-by=/usr/share/keyrings/prebuilt-mpr-archive-keyring.gpg] https://proget.makedeb.org prebuilt-mpr $(lsb_release -cs)" | sudo tee /etc/apt/sources.list.d/prebuilt-mpr.list
   sudo apt update
   sudo apt install just

   # On other systems, see: https://github.com/casey/just#installation
   ```

2. **Install all dependencies:**

   ```bash
   just install
   ```

3. **Start development servers:**
   ```bash
   just dev
   ```

### Option 2: Manual Setup

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd aifile2
   ```

2. **Install backend dependencies:**

   ```bash
   cd backend
   pip install -r requirements.txt
   cd ..
   ```

3. **Install frontend dependencies:**

   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. **Start with Docker:**
   ```bash
   docker-compose -f backend/docker-compose.yml -f frontend/docker-compose.yml up
   ```

## Available Commands

### Using Just

- `just install` - Install all project dependencies
- `just dev` - Start development servers with Docker
- `just lint` - Run ESLint on JavaScript/React code
- `just test` - Run tests for both backend and frontend
- `just build` - Build Docker containers
- `just clean` - Stop containers and clean Docker system

### Manual Commands

#### Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

## Development

### Backend Development

- **Framework:** FastAPI
- **Language:** Python 3.8+
- **API Documentation:** Available at `http://localhost:8000/docs` when running
- **Code Quality:** Uses flake8 and pylint for linting

### Frontend Development

- **Framework:** React 18
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Code Quality:** Uses ESLint for linting

### Code Quality

The project maintains high code quality standards:

- **Python:** Pylint score of 10.00/10
- **JavaScript/React:** ESLint with no errors
- **Automatic formatting:** Use `just lint` to fix common issues

## Deployment

### VPS Deployment

1. **Clone on your VPS:**

   ```bash
   git clone <repository-url>
   cd aifile2
   ```

2. **Install dependencies:**

   ```bash
   just install
   ```

3. **Start services:**
   ```bash
   just dev
   ```

### Docker Deployment

The project includes Docker configurations for both backend and frontend:

```bash
docker-compose -f backend/docker-compose.yml -f frontend/docker-compose.yml up -d
```

## API Endpoints

- **Backend API:** `http://localhost:8000`
- **API Documentation:** `http://localhost:8000/docs`
- **Frontend:** `http://localhost:3000` (development)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting: `just lint`
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).
