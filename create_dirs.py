import os
import sys

base = r'C:\users\leestott\digitaltwin'
dirs = [
    'frontend/src/components',
    'frontend/src/hooks', 
    'frontend/src/utils',
    'frontend/public',
    'backend/src/routes',
    'backend/src/services',
    'backend/src/simulator',
    'backend/tests',
    'twin',
    'assets',
    'docs'
]

print("Creating directory structure...")
for d in dirs:
    full_path = os.path.join(base, d)
    os.makedirs(full_path, exist_ok=True)
    print(f'  Created: {full_path}')

print("\nAll directories created successfully!")
print("\nPlease run the script again after directories are created.")
sys.exit(0)
