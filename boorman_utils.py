from functools import partial
from botapad.parser import Botapad
from botapi.botapi import BotaIgraph
import logging
import itertools as it

import redis
from redisgraph import Graph

from neo4j import GraphDatabase
import igraph

def main(path):
    bot = BotaIgraph(directed=True)
    pad = Botapad(bot,  "Boorman", "Boorman blabla", delete=True, verbose=True, debug=True)
    pad.parse(path)
    ig = bot.get_igraph("Boorman")
    ig.write_pickle("pads/boorman.pickle")


if __name__ == "__main__":
    main("/tmp/boorman.csv")