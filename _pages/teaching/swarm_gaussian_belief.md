---
layout: archive
title: "Gaussian Belief propagation for Swarm Robotics"
permalink: teaching/swarm_gaussian_belief/
author_profile: false
---

This is a page designed for a ~20 minute exercise as part of the Swarm Robotics theme in the Advanced Topics in Robotics course at the University of Bristol. This is a condensed and adapted version of: [Gaussian Belief Propagation](https://gaussianbp.github.io/) by [Joseph Ortiz](https://joeaortiz.github.io/), [Talfan Evans](http://www.talfanevans.co.uk/) and [Andrew J. Davison](https://www.doc.ic.ac.uk/~ajd/). Boxed frames on this page are directly copied from that resource. Please refer to that excellent resource for further reading and deeper exploration of Gaussian Belief Propagation. See their short video introduction to the article [here](https://www.youtube.com/watch?v=ngzQxMgtCcg).

**NB**: A static version of their interactive article has been published on [arXiv](https://arxiv.org/abs/2107.02308) and can be cited as:

@article{Ortiz2021visualGBP,<br>
title = {A visual introduction to Gaussian Belief Propagation},<br>
author = {Ortiz, Joseph and Evans, Talfan and Davison, Andrew J.},<br>
journal={arXiv preprint arXiv:2107.02308},<br>
year = {2021},<br>
}

The goal of this exercise is to gain a fundamental understanding of Gaussian Belief Propagation and how it can be applied to robotics, particularly in decentralized and uncertain environments. Focus on grasping the core concepts through reading and interacting with the simulations. We are going to go through a few exercises to demonstrate how a Gaussian Belief Propagation can be used to estimate functions based on decentralised and uncertain information exchange in a way that is scalable and robust in dynamic environments. 

In these interactive demonstrations, we are looking at factor graph (see box below) information abstractions rather than topological networks or swarms. The “variables” could represent states that a robot may care about (for example its position, the position of a landmark, the position of another robot…) and “factors” represent relationships between these variables, usually by way of a robotic sensor (“this landmark is 2m ahead”, “Robot B is 1m East”, “I have moved 1m forward”...). Each of these are represented as a (multivariate) Gaussian probability density distribution, which means we can perform fast mathematical functions on to combine, update, or marginalise these distributions. Each agent in a swarm would only have good first hand knowledge of a subsection of the factor graph, but, as we shall see, propagating gaussian messages through a network means that they can converge toward accurate and complete information both locally and globally.

<iframe
  id="FactorGraph"
  src="/assets/teaching/GBP/factor_graph.html"
  onload="resizeIframefg(this)"
  width="100%"
  ></iframe>

  <script>
function resizeIframefg(iframe) {
  iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 100) + 'px';
  iframe.style.width = (iframe.contentWindow.document.body.scrollWidth + 20) + 'px';
}
</script>

These demonstrations are taken from this [page on Gaussian Belief Propagation](https://gaussianbp.github.io/), and are not specifically designed for robotic swarms. They should give you an intuition about how GBP works and may be applied to robotic swarms, and may motivate you to explore the maths more thoroughly outside of this session. The resource itself provides a good list of references, I would also encourage you to watch the video summary they provide, and to look at this [distill article](https://distill.pub/2019/visual-exploration-gaussian-processes/#MargCond) for further reading.

## Introduction (5 minutes)

<iframe
  id="widgetFrame1"
  src="/assets/teaching/GBP/widget1.html"
  width="100%"
  onload="resizeIframe1(this)"
  ></iframe>
  
<script>
function resizeIframe1(iframe) {
  iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 100) + 'px';
}
</script>

In each of the interactive widgets below, you can choose to “activate” a node, each time you “activate” one, it performs the actions in the algorithm, in the order above.

## Graph/Network topology (5 minutes)

The important mechanism is that the nodes pass each other simple local information, and converge on a global solution. This has a strong relationship with the way that they are connected. Try the chain, loop, and grid topologies in the box below and see if you can explain why they have slightly different speeds of convergence. The circle around the dots is a 2D rendering of a gaussian (knwowledge with uncertainty) about a variable.

Q. Why do some of them overshoot, taking a while to stabilise?

<iframe
  id="widgetFrame4"
  src="/assets/teaching/GBP/widget4.html"
  width="100%"
  onload="resizeIframe4(this)"
  ></iframe>
  
<script>
function resizeIframe4(iframe) {
  iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 100) + 'px';
}
</script>

We can set up our graph with a variety of topologies. A chain graph can have a clear order and hierarchy, so that it can very quickly converge to the optimal solution.

<iframe
  id="widgetFrame2"
  src="/assets/teaching/GBP/widget2.html"
  width="100%"
  onload="resizeIframe2(this)"
  ></iframe>
  
<script>
function resizeIframe2(iframe) {
  iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 100) + 'px';
}
</script>

Make a distribution of red data points that approximates a simple or complex function over the space (or generate a random one).

Q. Notice that in a "sweep" the nodes only send a message "downstream", then only "upstream". Could this work in a dynamic swarm?

Q. Clicking on the same node repeatedly does nothing – why?

Q. What is the difference between doing a "sweep", a series of random messages, and synchronous iterations? Which is most efficient? Most ordered? Most swarm-like?

## Gaussian Belief Propagation Playground (10 minutes)

<iframe
  id="widgetFrame3"
  src="/assets/teaching/GBP/widget3.html"
  width="100%"
  onload="resizeIframe3(this)"
  ></iframe>
  
<script>
function resizeIframe3(iframe) {
  iframe.style.height = (iframe.contentWindow.document.body.scrollHeight + 100) + 'px';
}
</script>

Set up 2 (or more) connected groups of variable nodes – one chain, one loopy (like example image below). Set the priors to be quite far from the true positions. Then run 1 iteration at a time. You may also try pressing play, and setting the prior position to its maximum, then its minimum.

<img src="/images/3_networks.png" width="45%;"><img src="/images/3_networks_2.png" width="45%;">

Q. What is the difference in the way that the groups converge, why?

Switch over to the "Robot Simulation". This plots a robot's current position, its intermittent historic positions, and the position of landmarks it has "seen".

Q. What happens if the robot travels a long way without seeing a landmark?

Q. What then changes as soon as it sees a landmark? - This is more obvious the more slowly you have the speed running

Q. How does the uncertainty change if you lower or raise the odometry and sensor precision?

Q. What happens to the uncertainty if you add more landmarks, why?

Q. This simulation shows how a single robot can build up a map. How might this translate to a swarm, and what advantages or disadvatages might doing this with a swarm bring?

