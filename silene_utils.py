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
    pad = Botapad(bot,  "Silene", "Sinitic Lexical Network", delete=False, verbose=True, debug=True)
    pad.parse(path)
    ig = bot.get_igraph("Silene")
    ig.write_pickle("pads/silene.pickle")


def igraph_to_neo4j():
    gdb = GraphDatabase.driver("neo4j://localhost:7687", auth=("neo4j", "n4j"))
    ig = igraph.load("pads/silene.pickle")
    indexed = set()

    def create_indexes(tx):
        labels = {v['nodetype'].split('_')[-1] for v in ig.vs}
        print("\n".join(labels))
        for l in labels:
            # tx.run(f"CREATE INDEX IF NOT EXISTS FOR (w:{l}) ON (w.nid)")
            tx.run(f"CREATE CONSTRAINT ON (n:{l}) ASSERT n.nid IS UNIQUE")

    def create_nodes(tx, start):
        print(start)
        for i, v in enumerate(ig.vs[start:start+5000]):
            i += start
            label = v['nodetype'].split('_')[-1]
            props = f"nid:{i}, " + ", ".join([f"{k}:'" + v.replace("'", "\\'") + "'" for k, v in v['properties'].items() if isinstance(v, str)])
            cmd = f"CREATE (:{label} {{{props}}})"
            tx.run(cmd)

    def create_edges(tx, start):
        print(start)
        for e in ig.es[start:start+5000]:
            src_label = ig.vs[e.source]['nodetype'].split('_')[-1]
            tgt_label = ig.vs[e.target]['nodetype'].split('_')[-1]
            cmd = f"MATCH (src:{src_label} {{nid:{e.source}}}) MATCH (tgt:{tgt_label} {{nid:{e.target}}}) CREATE (src) -[:{e['edgetype'][8:].split('/')[-1]}]-> (tgt)"
            tx.run(cmd)

    destroy_neo4j(gdb)

    with gdb.session() as session:
        session.write_transaction(create_indexes)

    n = int(len(ig.vs) / 5000)
    with gdb.session() as session:
        for k in range(n + 1):
            session.write_transaction(create_nodes, k*5000)

    with gdb.session() as session:
        n = int(len(ig.es) / 5000)
        for k in range(n + 1):
            session.write_transaction(create_edges, k*5000)


def destroy_neo4j(gdb: GraphDatabase):
    with gdb.session() as session:
        session.run("MATCH (n) DETACH DELETE n")
        result = session.run("CALL db.schemaStatements()")
        drops = [r['dropStatement'] for r in result]
        for d in drops:
            session.run(d)

def import_redis():
    r = redis.Redis(host="localhost", port=6379)
    redis_graph = Graph("silene", r)
    ig = igraph.load("pads/silene.pickle")

    def create_indexes():
        labels = {v['nodetype'].split('_')[-1] for v in ig.vs}
        print("\n".join(labels))
        for l in labels:
            yield f"CREATE INDEX ON :{l}(nid)"
            #yield f"CREATE CONSTRAINT ON (n:{l}) ASSERT n.nid IS UNIQUE"

    def create_nodes():
        for v in ig.vs:
            label = v['nodetype'].split('_')[-1]
            props = f"nid:{v.index}, uuid:'{v['uuid']}', " + ", ".join([f"{k}:'" + v.replace("'", "\\'") + "'" for k, v in v['properties'].items() if isinstance(v, str)])
            cmd = f"CREATE (:{label} {{{props}}})"
            yield cmd

    def create_edges():
        for e in ig.es:
            src_label = ig.vs[e.source]['nodetype'].split('_')[-1]
            tgt_label = ig.vs[e.target]['nodetype'].split('_')[-1]
            cmd = f"MATCH (src:{src_label} {{nid:{e.source}}}) MATCH (tgt:{tgt_label} {{nid:{e.target}}}) CREATE (src) -[:{e['edgetype'][8:].split('/')[-1]}]-> (tgt)"
            yield cmd

    for i, cmd in enumerate(it.chain(
        create_indexes(),
        create_nodes(),
        create_edges()
    )):
        redis_graph.query(cmd)
        if i % 50000 == 0:
            print(i)
            redis_graph.commit()


def test_redis():
    r = redis.Redis(host="localhost", port=6379)
    gdb = Graph("silene", r)
    result = gdb.query("""
    MATCH (s:Sinogram {label:'講'})
    MATCH p = () -[*..3]-> (s) -[*..3]-> (:Wordform)
    UNWIND nodes(p) as n
    WITH DISTINCT n
    RETURN n.uuid
    """)
    print(result.pretty_print())
    print([r[0] for r in result.result_set])
    r.close()

if __name__ == "__main__":
    #main("/tmp/silene.csv")
    #igraph_to_neo4j()
    #import_redis()
    test_redis()

