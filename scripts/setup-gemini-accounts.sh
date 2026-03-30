#!/bin/bash

# Colores para la terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN}  Configuración Multi-Cuenta para Gemini CLI / OpenCode ${NC}"
echo -e "${BLUE}======================================================${NC}"
echo -e "${YELLOW}Este script te ayudará a loguear tus 5 cuentas sin que se pisen.${NC}\n"

PROFILES_DIR="$HOME/.gemini-profiles"
mkdir -p "$PROFILES_DIR"

while true; do
    echo -e "------------------------------------------------------"
    read -p "Ingresá un nombre para el perfil (ej. cuenta1, dev, pro) o dejá vacío para salir: " PROFILE_NAME

    if [ -z "$PROFILE_NAME" ]; then
        echo -e "\n${GREEN}[✓] Saliendo del configurador. ¡Todo listo!${NC}"
        break
    fi

    PROFILE_PATH="$PROFILES_DIR/$PROFILE_NAME"
    
    echo -e "\n${BLUE}[*] Configurando perfil: ${GREEN}$PROFILE_NAME${NC}"
    mkdir -p "$PROFILE_PATH"

    echo -e "${YELLOW}[*] Ejecutando login... se abrirá tu navegador para que inicies sesión.${NC}"
    
    # Ejecutamos el login inyectando la variable de entorno SOLO para este proceso
    GEMINI_CLI_HOME="$PROFILE_PATH" gemini auth login

    echo -e "${GREEN}[✓] Perfil '$PROFILE_NAME' configurado correctamente en $PROFILE_PATH${NC}\n"
done

echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN}¡Tus cuentas están listas! DevHub las detectará automáticamente.${NC}"
