from setuptools import setup, find_packages
import os

setup(
    name="orca_task_sdk",
    version="0.1.0",
    author="Koii Network",
    author_email="info@koii.network",
    description="SDK for Orca tasks to communicate with the parent Koii Node task executable.",
    long_description=open('README.md').read() if os.path.exists('README.md') else '',
    long_description_content_type="text/markdown",
    url="https://github.com/koii-network/pro-me-the-us/tree/main/task_sdk/python", # Replace with actual URL if public
    packages=find_packages(where='src'),
    package_dir={'': 'src'},
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License", # Assuming Apache 2.0 from parent Koii projects
        "Operating System :: OS Independent",
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules"
    ],
    python_requires='>=3.7',
    install_requires=[
        "requests>=2.20.0",
    ],
    keywords='koii orca task sdk',
) 