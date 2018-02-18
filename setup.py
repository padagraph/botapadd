#!/usr/bin/env python

from setuptools import setup, find_packages

required = []
try :
    with open('requirements.txt') as f:
        required = [ e for e in f.read().splitlines() if e[0]!= "#" ]
except :
    print("no requirements found")

required = []

setup(
    name='botapad',
    version='0.3',
    description='padagraph pad parser',
    author='ynnk, a-tsioh',
    author_email='contact@padagraph.io',
    url='www.padagraph.io',
    install_requires=required
)
