#!/usr/bin/env python

from setuptools import setup, find_packages


"""
0.6.1 log formating
      visualisation url parameters 
0.6   added edge direction with reification > or < where % === %<
"""


required = []
try :
    with open('requirements.txt') as f:
        required = [ e for e in f.read().splitlines() if e[0]!= "#" ]
except :
    print("no requirements found")

required = []

setup(
    name='botapad',
    version='0.6.1',
    description='padagraph pad parser',
    author='ynnk, a-tsioh',
    author_email='contact@padagraph.io',
    url='botapad.padagraph.io',
    packages=['botapad'], #+ ['botapad.%s' % submod for submod in find_packages('botapad')],
    install_requires=required
)
