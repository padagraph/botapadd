from functools import partial
from botapad.parser import Botapad
from botapi.botapi import BotaIgraph
import logging

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

if __name__ == "__main__":
    #main("/tmp/silene.csv")
    igraph_to_neo4j()
